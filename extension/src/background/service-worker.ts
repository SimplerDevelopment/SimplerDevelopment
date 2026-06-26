// Background service worker (MV3).
// Responsibilities:
//  - Create context menus on install
//  - Route context-menu clicks → API calls
//  - Handle keyboard command "open-quick-capture"
//  - Refresh the action badge with a count of related Brain notes for the
//    current tab whenever the URL changes (cached per-tab to avoid re-fetch)

import { api, ApiAuthError, ApiNetworkError, ApiNotConfiguredError } from '../lib/api';
import {
  clearTabCache,
  getConfig,
  getTabCache,
  setTabCache,
} from '../lib/storage';
import { enqueue, flushQueue } from '../lib/offline-queue';
import type { ExtensionMessage, ExtractedPageResponse, SelectionResponse } from '../lib/messages';

const MENU_SAVE_SELECTION = 'sd-brain-save-selection';
const MENU_SAVE_PAGE = 'sd-brain-save-page';
const MENU_SEARCH_SELECTION = 'sd-brain-search-selection';

// Drain any captures that were queued while offline: once on worker wake-up,
// and again whenever the worker observes the connection come back.
void flushQueue();
self.addEventListener('online', () => {
  void flushQueue();
});

chrome.runtime.onInstalled.addListener(() => {
  // Be defensive — re-creating menus that already exist throws.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SAVE_SELECTION,
      title: 'Save selection as Brain note',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU_SAVE_PAGE,
      title: 'Save page to Brain',
      contexts: ['page', 'action'],
    });
    chrome.contextMenus.create({
      id: MENU_SEARCH_SELECTION,
      title: 'Search Brain for selection',
      contexts: ['selection'],
    });
  });

  // Side panel opens when user clicks the action toolbar button (if they
  // explicitly choose side panel mode).
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: false })
      .catch(() => {});
  }
});

// --- Notifications helper --------------------------------------------------

function notify(title: string, message: string) {
  if (!chrome.notifications) return;
  chrome.notifications.create(
    {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('public/icon-128.png'),
      title,
      message,
      priority: 1,
    },
    () => void chrome.runtime.lastError
  );
}

// --- Context menu handlers -------------------------------------------------

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === MENU_SAVE_SELECTION) {
    const sel = (info.selectionText ?? '').trim();
    if (!sel) {
      notify('SD Brain', 'No selection to save.');
      return;
    }
    const input = {
      title: tab.title?.slice(0, 120) || 'Selection',
      body: `> ${sel}\n\n— from ${tab.url ?? ''}`,
      sourceUrl: tab.url ?? undefined,
      tags: ['from-extension', 'selection'],
    };
    try {
      const note = await api.createNote(input);
      notify('Saved to Brain', noteSummary(note.title));
      await refreshBadge(tab.id, tab.url);
    } catch (err) {
      if (err instanceof ApiNetworkError) {
        await enqueue('note', input);
        notify('Saved offline', 'Will sync to Brain when you reconnect.');
      } else {
        handleErr(err);
      }
    }
    return;
  }

  if (info.menuItemId === MENU_SAVE_PAGE) {
    const extracted = await safeExtract(tab.id);
    const ext = extracted && extracted.ok ? extracted.data : null;
    const baseTitle = (ext?.title || tab.title || 'Page').slice(0, 200);
    const baseBody = ext?.text?.slice(0, 4000) ?? '';
    const input = {
      title: baseTitle,
      body: baseBody || `Saved from ${tab.url ?? ''}`,
      sourceUrl: tab.url ?? undefined,
      tags: ['from-extension', 'page-save'],
    };
    try {
      const note = await api.createNote(input);
      notify('Saved to Brain', noteSummary(note.title));
      await refreshBadge(tab.id, tab.url);
    } catch (err) {
      if (err instanceof ApiNetworkError) {
        await enqueue('note', input);
        notify('Saved offline', 'Will sync to Brain when you reconnect.');
      } else {
        handleErr(err);
      }
    }
    return;
  }

  if (info.menuItemId === MENU_SEARCH_SELECTION) {
    try {
      const sel = (info.selectionText ?? '').trim();
      if (!sel) return;
      const cfg = await getConfig();
      if (!cfg) {
        await chrome.runtime.openOptionsPage();
        return;
      }
      // Open portal search in a new tab — simplest, most useful UX
      const portal = cfg.portalUrl.replace(/\/+$/, '');
      const target = `${portal}/portal/brain/search?q=${encodeURIComponent(sel)}`;
      await chrome.tabs.create({ url: target });
    } catch (err) {
      handleErr(err);
    }
  }
});

function noteSummary(title: string): string {
  return title.length > 80 ? title.slice(0, 77) + '...' : title;
}

function handleErr(err: unknown) {
  if (err instanceof ApiNotConfiguredError) {
    notify('SD Brain — not configured', 'Open the options page to set your portal URL and API key.');
    chrome.runtime.openOptionsPage();
    return;
  }
  if (err instanceof ApiAuthError) {
    notify('SD Brain — auth failed', 'Your API key was rejected. Reopen options to update it.');
    chrome.runtime.openOptionsPage();
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  notify('SD Brain error', msg.slice(0, 200));
}

async function safeExtract(tabId: number): Promise<ExtractedPageResponse | null> {
  try {
    return await new Promise<ExtractedPageResponse>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' } satisfies ExtensionMessage, (resp: ExtractedPageResponse) => {
        const e = chrome.runtime.lastError;
        if (e) reject(new Error(e.message));
        else resolve(resp);
      });
    });
  } catch {
    return null;
  }
}

// --- Keyboard command ------------------------------------------------------

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-quick-capture') return;
  // Prefer popup; fall back to side panel
  if (chrome.action?.openPopup) {
    try {
      await chrome.action.openPopup();
      return;
    } catch {
      // fallthrough
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId && chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch {
      // ignore — side panel may not be available in this context
    }
  }
});

// --- Badge updater ---------------------------------------------------------

async function refreshBadge(tabId: number, url: string | undefined) {
  if (!url || !/^https?:/i.test(url)) {
    await chrome.action.setBadgeText({ text: '', tabId });
    return;
  }
  try {
    const cfg = await getConfig();
    if (!cfg) {
      await chrome.action.setBadgeText({ text: '', tabId });
      return;
    }
    const cached = await getTabCache(tabId);
    const fresh = cached && cached.url === url && Date.now() - cached.fetchedAt < 60_000;
    let count: number;
    if (fresh) {
      count = cached.count;
    } else {
      const related = await api.notesRelated(url, 10);
      count = (related.exact?.length ?? 0) + (related.domain?.length ?? 0);
      await setTabCache(tabId, { url, count, fetchedAt: Date.now() });
    }
    await chrome.action.setBadgeBackgroundColor({ color: '#4f46e5', tabId });
    await chrome.action.setBadgeText({
      text: count > 0 ? (count > 99 ? '99+' : String(count)) : '',
      tabId,
    });
  } catch {
    // silent — never let badge errors interfere with browsing
    await chrome.action.setBadgeText({ text: '', tabId });
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' || (info.url && info.url !== tab.url)) {
    refreshBadge(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    refreshBadge(tabId, tab.url);
  } catch {
    /* tab gone */
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabCache(tabId).catch(() => {});
});

// --- Runtime message router ------------------------------------------------

chrome.runtime.onMessage.addListener((msg: ExtensionMessage, sender, sendResponse) => {
  if (msg?.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === 'REFRESH_BADGE') {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (tabId !== undefined) {
      chrome.tabs.get(tabId).then(
        (tab) => refreshBadge(tabId, tab.url),
        () => {}
      );
    }
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

// Re-export to satisfy types when this file is treated as a module
export type _ServiceWorkerMessage = SelectionResponse | ExtractedPageResponse;

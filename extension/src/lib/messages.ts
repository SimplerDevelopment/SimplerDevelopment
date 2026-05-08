// Typed message contracts for cross-context messaging.
// background <-> content script: EXTRACT_PAGE / GET_SELECTION
// background <-> popup/sidepanel: REFRESH_BADGE, etc.

export type PageKind = 'person' | 'company' | 'article';

export interface ExtractedPage {
  url: string;
  title: string;
  text: string;
  html: string;
  selection: string;
  pageKind: PageKind;
}

export type ExtensionMessage =
  | { type: 'EXTRACT_PAGE' }
  | { type: 'GET_SELECTION' }
  | { type: 'REFRESH_BADGE'; tabId?: number }
  | { type: 'OPEN_OPTIONS' }
  | { type: 'TOAST'; level: 'success' | 'error' | 'info'; text: string };

export type ExtractedPageResponse = { ok: true; data: ExtractedPage } | { ok: false; error: string };
export type SelectionResponse = { ok: true; data: { selection: string } } | { ok: false; error: string };

export function sendToTab<T = unknown>(
  tabId: number,
  msg: ExtensionMessage
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (response: T) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(response);
    });
  });
}

export function sendToRuntime<T = unknown>(msg: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: T) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(response);
    });
  });
}

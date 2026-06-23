// Typed wrapper around chrome.storage.local for the small set of
// extension-config keys we need.

export interface ExtensionConfig {
  portalUrl: string;
  apiKey: string;
  // Optional: cache the most recent /auth/test response for the badge / labels
  user?: { name?: string | null; email?: string | null };
  client?: { name?: string };
}

const KEY = 'sd-brain-config';

export async function getConfig(): Promise<ExtensionConfig | null> {
  try {
    const out = await chrome.storage.local.get(KEY);
    const raw = out[KEY];
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.portalUrl !== 'string' || typeof raw.apiKey !== 'string') {
      return null;
    }
    return raw as ExtensionConfig;
  } catch {
    return null;
  }
}

export async function setConfig(cfg: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ [KEY]: cfg });
}

export async function clearConfig(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

export function normalizePortalUrl(input: string): string {
  let v = input.trim();
  if (!v) return v;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  // strip trailing slash
  v = v.replace(/\/+$/, '');
  return v;
}

// Per-tab small caches (e.g. notes/related counts), keyed by tabId.
// Stored under chrome.storage.session when available, else local.
const TAB_CACHE_PREFIX = 'sd-brain-tabcache-';

export interface TabCacheEntry {
  url: string;
  count: number;
  fetchedAt: number;
}

async function tabStore() {
  const sess = (chrome.storage as unknown as { session?: chrome.storage.StorageArea })
    .session;
  return sess ?? chrome.storage.local;
}

export async function getTabCache(tabId: number): Promise<TabCacheEntry | null> {
  try {
    const store = await tabStore();
    const key = TAB_CACHE_PREFIX + tabId;
    const out = await store.get(key);
    return (out[key] as TabCacheEntry | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function setTabCache(tabId: number, entry: TabCacheEntry): Promise<void> {
  const store = await tabStore();
  const key = TAB_CACHE_PREFIX + tabId;
  await store.set({ [key]: entry });
}

export async function clearTabCache(tabId: number): Promise<void> {
  const store = await tabStore();
  await store.remove(TAB_CACHE_PREFIX + tabId);
}

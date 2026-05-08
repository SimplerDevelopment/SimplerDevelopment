// Content script — injected into every page. Responds to messages from the
// background service worker / popup with extracted page data and selection.

import { extractPage, getSelection } from '../lib/page-extract';
import type { ExtractedPageResponse, SelectionResponse, ExtensionMessage } from '../lib/messages';

chrome.runtime.onMessage.addListener(
  (msg: ExtensionMessage, _sender, sendResponse) => {
    if (msg?.type === 'EXTRACT_PAGE') {
      try {
        const data = extractPage();
        const resp: ExtractedPageResponse = { ok: true, data };
        sendResponse(resp);
      } catch (err) {
        const resp: ExtractedPageResponse = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        sendResponse(resp);
      }
      return true;
    }
    if (msg?.type === 'GET_SELECTION') {
      try {
        const data = getSelection();
        const resp: SelectionResponse = { ok: true, data };
        sendResponse(resp);
      } catch (err) {
        const resp: SelectionResponse = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        sendResponse(resp);
      }
      return true;
    }
    return false;
  }
);

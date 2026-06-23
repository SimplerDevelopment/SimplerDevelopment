import type {
  MessageSource,
  VisualEditorMessage,
} from '@/types/visual-editor';

const ALLOWED_ORIGINS = [
  'simplerdevelopment.com',
  '.simplerdevelopment.com',
  '.up.railway.app',
];

export function isValidOrigin(origin: string): boolean {
  // Allow localhost in development
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    return ALLOWED_ORIGINS.some((allowed) => {
      if (allowed.startsWith('.')) {
        return hostname.endsWith(allowed) || hostname === allowed.slice(1);
      }
      return hostname === allowed;
    });
  } catch {
    return false;
  }
}

export function createMessage<T>(
  source: MessageSource,
  type: string,
  payload: T,
): VisualEditorMessage<T> {
  return {
    source,
    type,
    payload,
    timestamp: Date.now(),
  };
}

export function isVisualEditorMessage(
  data: unknown,
): data is VisualEditorMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return (
    (msg.source === 'sd-editor-parent' || msg.source === 'sd-editor-iframe') &&
    typeof msg.type === 'string' &&
    typeof msg.timestamp === 'number'
  );
}

export function sendToIframe(
  iframe: HTMLIFrameElement | null,
  type: string,
  payload: unknown,
): void {
  if (!iframe?.contentWindow) return;
  const message = createMessage('sd-editor-parent', type, payload);
  iframe.contentWindow.postMessage(message, '*');
}

export function sendToParent(type: string, payload: unknown): void {
  if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
  const message = createMessage('sd-editor-iframe', type, payload);
  window.parent.postMessage(message, '*');
}

// Standalone Y → JSON helper for the realtime-server. Mirrors the
// `yArrayToJSON` function in `lib/realtime/doc-model.ts`. Kept in-package
// so this server can build/run without resolving any sd2026 path aliases.

import * as Y from 'yjs';

export function yArrayToJSON<T = unknown>(
  yArr: Y.Array<Y.Map<unknown>>
): T[] {
  const out: T[] = [];
  for (let i = 0; i < yArr.length; i++) {
    const item = yArr.get(i);
    if (item instanceof Y.Map) {
      out.push(item.toJSON() as T);
    } else if (item !== undefined && item !== null) {
      out.push(item as T);
    }
  }
  return out;
}

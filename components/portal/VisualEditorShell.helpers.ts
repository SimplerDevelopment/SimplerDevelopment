// Shared helpers for VisualEditorShell.tsx — extracted so the shell component
// stays under the file-size budget. Pure functions only; no component state.

/** Shape of an html-render block's `values` map. */
export type BlockValues = Record<
  string,
  string | Array<Record<string, string>> | Record<string, string>
>;

/**
 * Apply a single field write into an html-render block's `values` map,
 * honoring the dotted-field conventions used by both the inline content-edit
 * channel (`onBlockContentUpdated`) and the image-picker swap flow:
 *   - `field` (no dots): top-level value write.
 *   - `groupName.subKey`: group / link sub-field write.
 *   - `arrayName.index.subKey`: array-item sub-field write (one nesting level).
 */
export function applyDottedFieldUpdate(
  existing: BlockValues,
  field: string,
  value: string,
): BlockValues {
  const parts = field.split('.');
  if (parts.length >= 3) {
    // arrayName.index.subfield  (only one nesting level supported)
    const [arrayName, idxStr, ...rest] = parts;
    const idx = parseInt(idxStr, 10);
    const subKey = rest.join('.');
    const prevArr = existing[arrayName];
    const arr = Array.isArray(prevArr) ? [...prevArr] : [];
    const item = { ...(arr[idx] || {}), [subKey]: value };
    arr[idx] = item;
    return { ...existing, [arrayName]: arr };
  } else if (parts.length === 2) {
    // groupName.subfield — group / link sub-fields. Without this branch
    // the write would land in `values["groupName.subfield"]` (a literal
    // dotted key) which the renderer never reads.
    const [groupName, subKey] = parts;
    const prev = existing[groupName];
    const obj: Record<string, string> = (prev && typeof prev === 'object' && !Array.isArray(prev))
      ? (prev as Record<string, string>) : {};
    return { ...existing, [groupName]: { ...obj, [subKey]: value } };
  }
  return { ...existing, [field]: value };
}

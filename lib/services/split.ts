/**
 * PUX-193 (design doc screen 52): the services catalogue split into what the
 * client has and what they could add — the same rows the page already reads.
 */
export function splitServices<T extends { id: number }>(all: T[], activeIds: ReadonlySet<number>): { active: T[]; available: T[] } {
  const active: T[] = []; const available: T[] = [];
  for (const s of all) (activeIds.has(s.id) ? active : available).push(s);
  return { active, available };
}

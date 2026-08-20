/**
 * The approval-mode cookie name, alone, with zero imports.
 *
 * `middleware.ts` runs on the edge and cannot import `approval-mode.ts` (that
 * module pulls in next/headers, node:crypto and the database client). Both the
 * edge write-gate and the server-side resolver need to agree on this string, and
 * a rename that reached only one of them would silently stop the gate from
 * firing — a security hole that looks like a typo. So it lives here, shared.
 */
export const APPROVAL_COOKIE = 'sd_approval';

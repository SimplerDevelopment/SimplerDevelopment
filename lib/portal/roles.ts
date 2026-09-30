// The roles a client can invite someone as (PUX-149). One list, used by the
// Team page's picker and by the accept-invite page's explainer, so the words a
// person reads when they are invited are the words the inviter chose from.
// `owner` is the account itself and is never assigned through an invite.
export const ROLES = [
  { value: 'admin', label: 'Admin', description: 'Can invite members, change roles, manage projects' },
  { value: 'member', label: 'Member', description: 'Can view and collaborate on projects' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to projects and invoices' },
] as const;

export type InviteRole = (typeof ROLES)[number]['value'];

export function roleInfo(role: string | null | undefined) {
  return ROLES.find((r) => r.value === role) ?? null;
}

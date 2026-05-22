'use client';

// PermissionMatrix — per-user x per-permission-key checkbox grid for the
// Publishing Command Center. One row per member-role user; one column per
// permission key, grouped by category. Toggling a cell optimistically updates
// local state and fires POST /grant or /revoke; failures revert the toggle
// and surface an inline error row-level.
//
// Owners + admins do not appear in the matrix — they have implicit grants for
// every key. They render in a separate "Owners & admins" section below the
// table for transparency.

import { useMemo, useState, useTransition } from 'react';

export type PermissionMatrixMember = {
  userId: number;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
};

export type PermissionMatrixGrant = {
  userId: number;
  permissionKey: string;
};

type PermissionGroup = {
  label: string;
  icon: string;
  keys: ReadonlyArray<{ key: string; label: string }>;
};

const PERMISSION_GROUPS: ReadonlyArray<PermissionGroup> = [
  {
    label: 'Stage transitions',
    icon: 'swap_horiz',
    keys: [
      { key: 'move_to_idea',       label: 'Idea' },
      { key: 'move_to_draft',      label: 'Draft' },
      { key: 'move_to_in_review',  label: 'In Review' },
      { key: 'move_to_scheduled',  label: 'Scheduled' },
      { key: 'move_to_published',  label: 'Published' },
      { key: 'move_to_archived',   label: 'Archived' },
    ],
  },
  {
    label: 'Card actions',
    icon: 'task_alt',
    keys: [
      { key: 'create_card', label: 'Create card' },
      { key: 'delete_card', label: 'Delete card' },
    ],
  },
  {
    label: 'Admin actions',
    icon: 'admin_panel_settings',
    keys: [
      { key: 'manage_campaigns',   label: 'Manage campaigns' },
      { key: 'manage_tags',        label: 'Manage tags' },
      { key: 'manage_permissions', label: 'Manage permissions' },
    ],
  },
];

const ROLE_BADGE: Record<PermissionMatrixMember['role'], string> = {
  owner:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  admin:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  member: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function PermissionMatrix({
  members,
  ownersAndAdmins,
  initialGrants,
  canGrantManagePermissions,
}: {
  members: PermissionMatrixMember[];
  ownersAndAdmins: PermissionMatrixMember[];
  initialGrants: PermissionMatrixGrant[];
  /** True iff the current user is an owner. Only owners can grant the
   *  `manage_permissions` key — non-owners see that cell disabled. */
  canGrantManagePermissions: boolean;
}) {
  // Granted set keyed by `${userId}:${key}` for O(1) toggle lookup.
  const [granted, setGranted] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const g of initialGrants) s.add(`${g.userId}:${g.permissionKey}`);
    return s;
  });
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const flatKeys = useMemo(
    () => PERMISSION_GROUPS.flatMap((g) => g.keys.map((k) => k.key)),
    [],
  );

  const toggle = (userId: number, permissionKey: string) => {
    const cellId = `${userId}:${permissionKey}`;
    if (pendingCells.has(cellId)) return;
    const wasGranted = granted.has(cellId);
    const next = new Set(granted);
    if (wasGranted) next.delete(cellId);
    else next.add(cellId);
    setGranted(next);
    setPendingCells((s) => new Set(s).add(cellId));
    setErrors((e) => {
      if (!(userId in e)) return e;
      const rest = { ...e };
      delete rest[userId];
      return rest;
    });

    startTransition(async () => {
      try {
        const endpoint = wasGranted
          ? '/api/portal/publishing/permissions/revoke'
          : '/api/portal/publishing/permissions/grant';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, permissionKey }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
        };
        if (!res.ok || payload.success === false) {
          throw new Error(payload.message || `HTTP ${res.status}`);
        }
      } catch (err) {
        // Revert the optimistic toggle on failure.
        setGranted((prev) => {
          const reverted = new Set(prev);
          if (wasGranted) reverted.add(cellId);
          else reverted.delete(cellId);
          return reverted;
        });
        setErrors((e) => ({
          ...e,
          [userId]: err instanceof Error ? err.message : 'Failed to update permission',
        }));
      } finally {
        setPendingCells((s) => {
          const cleared = new Set(s);
          cleared.delete(cellId);
          return cleared;
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-base">info</span>
          <div>
            <p className="font-medium">Owners and admins automatically have every permission.</p>
            <p className="mt-1 text-blue-800/90 dark:text-blue-300/90">
              The matrix below sets permissions for member-role users. Check a
              box to grant; uncheck to revoke. Changes save instantly.
            </p>
          </div>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <span className="material-symbols-outlined text-4xl text-gray-400">group_off</span>
          <h3 className="mt-2 text-base font-medium">No member-role users</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Invite team members from <span className="font-medium">Settings → Team</span> to assign them granular publishing permissions.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/40">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-700 dark:bg-gray-900/40 dark:text-gray-200"
                >
                  Member
                </th>
                {PERMISSION_GROUPS.map((group) => (
                  <th
                    key={group.label}
                    colSpan={group.keys.length}
                    className="border-l border-gray-200 px-3 py-2 text-center font-medium text-gray-700 dark:border-gray-800 dark:text-gray-200"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base">{group.icon}</span>
                      {group.label}
                    </span>
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-900/40">
                {PERMISSION_GROUPS.flatMap((group, gIdx) =>
                  group.keys.map((k, kIdx) => (
                    <th
                      key={k.key}
                      scope="col"
                      className={
                        'px-2 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 ' +
                        (kIdx === 0 ? 'border-l border-gray-200 dark:border-gray-800' : '')
                      }
                      title={k.key}
                    >
                      <span className="whitespace-nowrap">{k.label}</span>
                      {/* gIdx used to silence unused-var linting if any */}
                      <span className="sr-only">{group.label} {gIdx}</span>
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-950">
              {members.map((m) => (
                <tr key={m.userId} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top dark:bg-gray-950">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{m.name || m.email}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{m.email}</span>
                      <span className={'mt-1 inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ' + ROLE_BADGE[m.role]}>
                        {m.role}
                      </span>
                      {errors[m.userId] ? (
                        <span className="mt-1 inline-flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                          <span className="material-symbols-outlined text-sm">error</span>
                          {errors[m.userId]}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  {flatKeys.map((key, idx) => {
                    const cellId = `${m.userId}:${key}`;
                    const isChecked = granted.has(cellId);
                    const isPending = pendingCells.has(cellId);
                    const disabled =
                      isPending ||
                      (key === 'manage_permissions' && !canGrantManagePermissions);
                    const groupBoundary =
                      key === PERMISSION_GROUPS[1].keys[0].key ||
                      key === PERMISSION_GROUPS[2].keys[0].key ||
                      idx === 0;
                    return (
                      <td
                        key={key}
                        className={
                          'px-2 py-2 text-center align-middle ' +
                          (groupBoundary ? 'border-l border-gray-200 dark:border-gray-800' : '')
                        }
                      >
                        <label className="inline-flex cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
                            checked={isChecked}
                            disabled={disabled}
                            onChange={() => toggle(m.userId, key)}
                            aria-label={`${key} for ${m.name || m.email}`}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ownersAndAdmins.length > 0 ? (
        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <header className="mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-amber-600 dark:text-amber-400">key</span>
            <h3 className="text-sm font-medium">Owners and admins</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Implicit grant on every permission key.
            </span>
          </header>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ownersAndAdmins.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 dark:border-gray-800"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.name || m.email}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{m.email}</span>
                </div>
                <span className={'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ' + ROLE_BADGE[m.role]}>
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

'use client';

// PUX-135 — per-client feature-flags matrix. Rows are the flags defined in
// lib/feature-flags.ts (code); columns are clients; each cell is a checkbox
// toggling membership in that client's clients.featureFlags column (data).
//
// Optimistic: flips the cell immediately, reverts + shows an inline error on
// a failed POST. A GA (defaultOn) row is rendered disabled — there is
// nothing left to toggle; the flag should be deleted instead.

import { useMemo, useState } from 'react';
import { PageHeader, Badge, SearchField, DataTable, type Column } from '@/components/admin/ui';
import type { FeatureFlagMatrix, FeatureFlagMatrixFlag, FeatureFlagMatrixClient } from '@/lib/admin/feature-flags';

interface Props {
  initial: FeatureFlagMatrix;
}

// Client list beyond which the filter box earns its keep.
const FILTER_THRESHOLD = 50;

export function FeatureFlagsMatrix({ initial }: Props) {
  const [flags, setFlags] = useState<FeatureFlagMatrixFlag[]>(initial.flags);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const clients: FeatureFlagMatrixClient[] = initial.clients;
  const filteredClients = useMemo(() => {
    if (!search) return clients;
    const s = search.toLowerCase();
    return clients.filter((c) => (c.company ?? '').toLowerCase().includes(s) || c.email.toLowerCase().includes(s));
  }, [clients, search]);

  const cellKey = (flagKey: string, clientId: number) => `${flagKey}:${clientId}`;

  async function toggle(flag: FeatureFlagMatrixFlag, client: FeatureFlagMatrixClient, nextEnabled: boolean) {
    const key = cellKey(flag.key, client.id);
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setPending((prev) => new Set(prev).add(key));

    // Optimistic flip.
    setFlags((prev) => prev.map((f) => f.key !== flag.key ? f : {
      ...f,
      clientIds: nextEnabled
        ? (f.clientIds.includes(client.id) ? f.clientIds : [...f.clientIds, client.id])
        : f.clientIds.filter((id) => id !== client.id),
    }));

    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, flag: flag.key, enabled: nextEnabled }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Failed');
    } catch (err) {
      // Revert.
      setFlags((prev) => prev.map((f) => f.key !== flag.key ? f : {
        ...f,
        clientIds: nextEnabled
          ? f.clientIds.filter((id) => id !== client.id)
          : (f.clientIds.includes(client.id) ? f.clientIds : [...f.clientIds, client.id]),
      }));
      setErrors((prev) => ({ ...prev, [key]: err instanceof Error ? err.message : 'Failed' }));
    } finally {
      setPending((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  }

  const columns: Array<Column<FeatureFlagMatrixFlag>> = [
    {
      key: 'flag',
      header: 'Flag',
      render: (f) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[13px] text-foreground truncate">{f.key}</span>
          {f.defaultOn && <Badge tone="ok">GA</Badge>}
        </div>
      ),
    },
    {
      key: 'since',
      header: 'Since',
      render: (f) => <span className="font-mono text-[12px] text-muted-foreground">{f.since}</span>,
    },
    ...filteredClients.map((client): Column<FeatureFlagMatrixFlag> => ({
      key: `client-${client.id}`,
      header: (
        <span className="normal-case font-medium" title={client.email}>
          {client.company ?? client.email}
        </span>
      ),
      align: 'center',
      render: (f) => {
        const key = cellKey(f.key, client.id);
        const checked = f.defaultOn || f.clientIds.includes(client.id);
        const isPending = pending.has(key);
        const error = errors[key];
        return (
          <div className="flex flex-col items-center gap-0.5">
            <input
              type="checkbox"
              checked={checked}
              disabled={f.defaultOn || isPending}
              title={f.defaultOn ? 'GA — on for everyone; delete the flag' : undefined}
              onChange={(e) => toggle(f, client, e.target.checked)}
              className="w-4 h-4 accent-[var(--admin-accent)] disabled:opacity-50"
            />
            {error && (
              <span className="material-icons text-[13px]" style={{ color: 'var(--admin-bad)' }} title={error}>
                error_outline
              </span>
            )}
          </div>
        );
      },
    })),
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Feature flags" subtitle="Per-client beta gates." />

      <p className="text-[13px] text-muted-foreground mb-4">
        Flags are defined in <code className="font-mono">lib/feature-flags.ts</code>; this page only decides which
        clients have them. Dogfood on client 104 first.
      </p>

      {clients.length > FILTER_THRESHOLD && (
        <div className="mb-3">
          <SearchField value={search} onChange={setSearch} placeholder="Filter clients by company or email…" className="min-w-[260px]" />
        </div>
      )}

      <DataTable
        columns={columns}
        rows={flags}
        rowKey={(f) => f.key}
      />
    </div>
  );
}

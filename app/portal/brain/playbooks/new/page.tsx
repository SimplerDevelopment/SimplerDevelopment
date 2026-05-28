'use client';

/**
 * Create a new playbook. After creation we redirect to /[id]/edit so the
 * user can immediately add steps. The new playbook starts in 'draft' status
 * — only the activate endpoint can flip it to 'active' (which requires at
 * least one step + a valid DAG).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PlaybookForm, {
  valuesToTriggerConfig,
  type PlaybookFormValues,
} from '@/components/brain/PlaybookForm';

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

export default function NewPlaybookPage() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          setTeam(
            json.data
              .filter((m: { userId?: number }) => typeof m.userId === 'number')
              .map((m: { userId: number; name: string | null; email: string }) => ({
                userId: m.userId,
                name: m.name,
                email: m.email,
              })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (values: PlaybookFormValues) => {
    setError(null);
    const triggerConfig = valuesToTriggerConfig(values);
    const r = await fetch('/api/portal/brain/playbooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: values.name,
        description: values.description.trim() || null,
        category: values.category.trim() || null,
        triggerKind: values.triggerKind,
        triggerConfig,
        ownerId: values.ownerId ?? undefined,
      }),
    });
    const json = await r.json();
    if (!r.ok || !json.success) {
      throw new Error(json.message || 'Failed to create playbook');
    }
    router.push(`/portal/brain/playbooks/${json.data.id}/edit`);
  };

  return (
    <div className="max-w-3xl mx-auto py-4 space-y-6">
      <div>
        <Link
          href="/portal/brain/playbooks"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="material-icons text-sm">chevron_left</span>
          Playbooks
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">play_circle</span>
          New playbook
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Starts as a draft. Add steps in the next screen, then activate when ready.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      )}

      <section className="bg-card border border-border rounded-xl p-5">
        <PlaybookForm
          mode="create"
          team={team}
          onCancel={() => router.push('/portal/brain/playbooks')}
          onSubmit={handleSubmit}
        />
      </section>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import type { BrainProfile } from '@/lib/brain/profiles';
import type { IndustryTemplate } from '@/lib/brain/industry-templates';
import { BrainDashboardWidgets } from '@/components/portal/BrainDashboardWidgets';

interface SettingsResponse {
  success: boolean;
  data?: {
    profile: BrainProfile;
    template: IndustryTemplate;
  };
  message?: string;
}

export default function BrainDashboardPage() {
  const [profile, setProfile] = useState<BrainProfile | null>(null);
  const [template, setTemplate] = useState<IndustryTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings');
      const json: SettingsResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'Failed to load Company Brain.');
      } else {
        setProfile(json.data.profile);
        setTemplate(json.data.template);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enableBrain = async () => {
    setEnabling(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const json: SettingsResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'Failed to enable Company Brain.');
      } else {
        setProfile(json.data.profile);
        setTemplate(json.data.template);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setEnabling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load Company Brain
          </div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!profile?.enabled) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <span className="material-icons text-5xl text-primary mb-3 block">psychology</span>
          <h1 className="text-2xl font-bold text-foreground mb-2">Company Brain</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
            A structured operating layer for your business. Capture communications, decisions, commitments,
            and tasks into a secure, AI-queryable command center. AI proposes — you approve.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 max-w-2xl mx-auto mb-8">
            <FeatureBullet icon="forum" title="Notes → tasks">
              Paste a transcript or forward an email. AI extracts decisions, commitments, and follow-ups for your review.
            </FeatureBullet>
            <FeatureBullet icon="reviews" title="Human approval">
              Nothing is written to your records until a human approves it. Every approval is audited.
            </FeatureBullet>
            <FeatureBullet icon="search" title="Ask anything">
              Search across communications, decisions, and follow-ups with citations back to source records.
            </FeatureBullet>
          </div>
          <button
            onClick={enableBrain}
            disabled={enabling}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {enabling
              ? <><span className="material-icons animate-spin text-base">progress_activity</span>Enabling…</>
              : <><span className="material-icons text-base">power_settings_new</span>Enable Company Brain</>
            }
          </button>
          <p className="text-xs text-muted-foreground mt-3">
            You can configure industry template, modules, and confidentiality after enabling.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">psychology</span>
            {profile.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {template?.label ?? 'Generic'} template · Confidentiality default: {profile.defaultConfidentiality}
          </p>
        </div>
        <Link
          href="/portal/brain/settings"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
        >
          <span className="material-icons text-base">settings</span>
          Settings
        </Link>
      </div>

      <BrainDashboardWidgets />
    </div>
  );
}

function FeatureBullet({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="text-left bg-muted/30 border border-border rounded-md p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1">
        <span className="material-icons text-base text-primary">{icon}</span>
        {title}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

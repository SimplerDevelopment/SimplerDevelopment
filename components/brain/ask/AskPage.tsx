'use client';

/**
 * PUX-167 (design doc screen 26): Ask — the conversation list beside the
 * existing BrainAgentChat. Lives at /portal/brain/agent, the route the studio
 * Brain home's gold hero already links (PUX-158): /portal/brain/ask stays
 * Connect AI, and /portal/brain/connect is already a different, tested page,
 * so neither moved. Citations: the agent route emits `sources` on its
 * confidence frame but BrainAgentChat does not render them yet — chips wait
 * on that, nothing is invented here. Studio-only; the server page gates.
 */

import { useState } from 'react';
import BrainAgentChat from '@/components/brain/BrainAgentChat';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import ConversationList from './ConversationList';
import ConversationThread from './ConversationThread';

export default function AskPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ponytail: the list refreshes on New / selection; a live turn's title lands on the next refresh.
  function select(id: number | null) {
    setSelectedId(id);
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 pt-4">
        <PortalPageHeader
          eyebrow="Brain"
          title={<span className="flex items-center gap-2"><span className="material-icons text-[var(--studio-gold-ink)]">auto_awesome</span>Ask</span>}
          subtitle="Ask the Brain about your business — it answers from your own records."
          className="mb-0 pb-3"
        />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 px-6 pb-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ConversationList selectedId={selectedId} onSelect={select} reloadKey={reloadKey} />
        <div className="min-h-0 overflow-hidden rounded-2xl border border-border bg-card">
          {selectedId === null ? <BrainAgentChat /> : <ConversationThread id={selectedId} onNew={() => select(null)} />}
        </div>
      </div>
    </div>
  );
}

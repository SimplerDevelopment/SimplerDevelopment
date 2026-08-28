import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { hasFlag } from '@/lib/feature-flags';
import BrainAgentChat from '@/components/brain/BrainAgentChat';
import AskPage from '@/components/brain/ask/AskPage';

export const metadata = {
  title: 'Brain Agent',
};

export default async function BrainAgentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  // PUX-167 (design doc screen 26): under the redesign this is Ask — conversations beside the chat.
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (client && hasFlag(client, 'portal-redesign')) return <AskPage />;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="material-icons text-primary text-lg">psychology</span>
          </div>
          <div>
            <h1 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground leading-tight">Brain Agent</h1>
            <p className="text-sm text-muted-foreground">
              Ask anything about your company knowledge base
            </p>
          </div>
        </div>
      </div>

      {/* Full-height chat area */}
      <div className="flex-1 min-h-0">
        <BrainAgentChat />
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import BrainAgentChat from '@/components/brain/BrainAgentChat';

export const metadata = {
  title: 'Brain Agent',
};

export default async function BrainAgentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

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

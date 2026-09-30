'use client';
// Extracted verbatim from app/portal/email/campaigns/[id]/page.tsx (PUX-175) — the page is pinned at 522 code lines.

export interface Send {
  id: number;
  email: string;
  name: string | null;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
}

export function CampaignSendsTab({ sends }: { sends: Send[] }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Send Log ({sends.length})</h3>
      </div>
      {sends.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No sends recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-5 py-2.5 font-medium text-muted-foreground">Recipient</th>
              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Sent</th>
              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Opened</th>
              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Clicked</th>
              <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Bounced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sends.map(s => (
              <tr key={s.id}>
                <td className="px-5 py-2.5">
                  <p className="text-foreground">{s.email}</p>
                  {s.name && <p className="text-xs text-muted-foreground">{s.name}</p>}
                </td>
                {[s.sentAt, s.openedAt, s.clickedAt].map((ts, i) => (
                  <td key={i} className="px-3 py-2.5 text-center">
                    <span className={`material-icons text-base ${ts ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {ts ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center">
                  <span className={`material-icons text-base ${s.bouncedAt ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {s.bouncedAt ? 'error' : 'radio_button_unchecked'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

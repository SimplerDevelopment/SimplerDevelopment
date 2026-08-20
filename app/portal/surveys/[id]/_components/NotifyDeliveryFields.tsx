/**
 * Notification delivery settings for a survey: how often (digest cadence) and to
 * whom (recipients).
 *
 * Split out of SurveySettings.tsx rather than added to it — that file is on the
 * god-file budget list (scripts/check-file-budget.ts), and these two controls are
 * a cohesive pair that nothing else in the settings form touches.
 */
'use client';

interface NotifyDeliveryFieldsProps {
  editDigest: string;
  setEditDigest: (v: string) => void;
  editNotifyUserIds: number[];
  setEditNotifyUserIds: (v: number[]) => void;
  teamMembers: { userId: number; name: string | null; email: string | null }[];
}

export default function NotifyDeliveryFields({
  editDigest,
  setEditDigest,
  editNotifyUserIds,
  setEditNotifyUserIds,
  teamMembers,
}: NotifyDeliveryFieldsProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Email Digest Summary</label>
        <select
          value={editDigest}
          onChange={(e) => setEditDigest(e.target.value)}
          className="w-full sm:w-48 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="off">Off</option>
          <option value="daily">Daily digest</option>
          <option value="weekly">Weekly digest</option>
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Receive a summary email with response stats and highlights
        </p>
      </div>

      {/* PUX-084: who receives the notification. Only people already on this
          account are selectable — responses can carry PII, so recipients are
          portal users rather than a free-text address list. Leaving every box
          unchecked keeps the previous behaviour (the account owner is notified). */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Notify these people</label>
        {teamMembers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Loading team members&hellip;
          </p>
        ) : (
          <div className="space-y-1.5">
            {teamMembers.map((m) => (
              <label key={m.userId} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editNotifyUserIds.includes(m.userId)}
                  onChange={(e) =>
                    setEditNotifyUserIds(
                      e.target.checked
                        ? [...editNotifyUserIds, m.userId]
                        : editNotifyUserIds.filter((v) => v !== m.userId),
                    )
                  }
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">
                  {m.name || m.email}
                  {m.name && m.email ? (
                    <span className="text-xs text-muted-foreground"> &middot; {m.email}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Applies to both the immediate email and the digest. With none selected, the
          account owner is notified.
        </p>
      </div>
    </>
  );
}

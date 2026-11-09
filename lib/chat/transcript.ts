/**
 * PUX-215 (design doc screen 79): a chat thread as plain text, for the
 * ticket that gets made from it. No ticket column links back to the chat,
 * so the transcript itself is the trail.
 */
export function transcript(messages: { authorKind: string; authorName: string | null; body: string; occurredAt: string }[], visitorName?: string | null): string {
  return messages
    .filter((m) => m.authorKind !== 'system')
    .map((m) => `[${new Date(m.occurredAt).toLocaleString()}] ${m.authorName || (m.authorKind === 'visitor' ? visitorName || 'Visitor' : 'Agent')}: ${m.body}`)
    .join('\n');
}

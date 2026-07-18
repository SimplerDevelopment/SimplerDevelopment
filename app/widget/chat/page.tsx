// Server entry — picks up `?id=` and renders the client component.
// The actual UI lives in chat-bootstrap.tsx (client) so we can use
// useEffect / EventSource without leaking onto the SSR pass.

import ChatBootstrap from './chat-bootstrap';

export const dynamic = 'force-dynamic';

export default async function WidgetChatPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <ChatBootstrap widgetId={id ?? ''} />;
}

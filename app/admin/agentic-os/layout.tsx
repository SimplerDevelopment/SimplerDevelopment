import { notFound } from 'next/navigation';
import { isLocalDev } from '@/lib/agentic-os/local-only';

// Server component — runs in the Node runtime before the client page mounts.
// In any non-development build the route returns a 404, so the page never
// renders and the API surface (also gated) is unreachable.
export default function AgenticOsLayout({ children }: { children: React.ReactNode }) {
  if (!isLocalDev()) notFound();
  return <>{children}</>;
}

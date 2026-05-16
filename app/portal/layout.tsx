// Server-component shell — auth + plugin-apps lookup happen here, then the
// existing 'use client' body is rendered via `PortalLayoutClient` (which
// preserves the legacy sidebar wiring, subdomain auto-resolver, editor
// preview-mode toggling, cmd-K palette, etc.). See `./PortalShell.tsx`.
import PortalShell from './PortalShell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}

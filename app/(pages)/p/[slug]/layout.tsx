import { PetersNavigation } from '@/components/peters-outdoor/PetersNavigation';
import { PetersFooterCTA } from '@/components/peters-outdoor/PetersFooterCTA';
import { PetersFooter } from '@/components/peters-outdoor/PetersFooter';

export default function PetersOutdoorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="peters-outdoor" style={{ backgroundColor: 'var(--po-bg)', color: 'var(--po-text)' }}>
      <PetersNavigation />
      <main>{children}</main>
      <PetersFooterCTA />
      <PetersFooter />
    </div>
  );
}

/**
 * PUX-214 (design doc screen 78): the integrations that are NOT connectable
 * here, drawn dashed and honest — Stripe is the billing backend (Connect),
 * Slack is a code comment. Studio-only; the page gates on hasFlag.
 */
import { GhostCard } from '@/components/portal/EmptyState';

export default function IntegrationGhosts() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-label="Not connectable here">
      <GhostCard icon="credit_card" title="Stripe" body="Runs your billing behind the scenes through Stripe Connect — it isn't a toggle here. Payouts and invoices live under Billing." href="/portal/settings/billing" />
      <GhostCard icon="forum" title="Slack" body="Not built yet. It appears here when there is something real to connect." />
    </div>
  );
}

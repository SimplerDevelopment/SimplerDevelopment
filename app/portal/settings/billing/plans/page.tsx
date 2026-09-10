import { redirect } from 'next/navigation';

// The plans/pricing (self-serve Stripe checkout) surface is hidden from this
// deployment's UI. The route still exists so locked-item deep links and
// bookmarks don't 404, but it lands on the settings index instead.
export default function BillingPlansPage() {
  redirect('/portal/settings');
}

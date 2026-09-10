import { redirect } from 'next/navigation';

// The payment/billing surfaces are hidden from this deployment's UI (nav,
// settings tab and direct URLs). The route still exists so deep links and
// bookmarks don't 404, but it lands on the settings index instead.
export default function SettingsBillingPage() {
  redirect('/portal/settings');
}

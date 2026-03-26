import { redirect } from 'next/navigation';

export default function TicketsRedirect() {
  redirect('/portal/settings/support');
}

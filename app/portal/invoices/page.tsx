import { redirect } from 'next/navigation';

export default function InvoicesRedirect() {
  redirect('/portal/billing');
}

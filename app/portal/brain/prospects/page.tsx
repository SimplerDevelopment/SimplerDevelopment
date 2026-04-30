import { redirect } from 'next/navigation';

export default function BrainProspectsRedirect() {
  redirect('/portal/brain/relationships?view=stale');
}

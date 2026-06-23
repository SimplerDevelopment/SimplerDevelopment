import { redirect } from 'next/navigation';

export default function BrainReviewRedirect() {
  redirect('/portal/brain/tasks?tab=review');
}

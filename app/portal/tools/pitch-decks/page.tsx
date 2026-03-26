import { redirect } from 'next/navigation';

export default function PitchDecksPage() {
  redirect('/portal/crm/proposals?tab=decks');
}

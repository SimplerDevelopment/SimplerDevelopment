import { redirect } from 'next/navigation';

export default function LegacyEmailAutomationsPage() {
  redirect('/portal/brain/automations?tab=presets');
}

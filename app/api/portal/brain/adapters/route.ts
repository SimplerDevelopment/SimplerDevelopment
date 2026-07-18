import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getOrCreateBrainProfile } from '@/lib/brain/profiles';
import { listEnabledAdapters } from '@/lib/brain/meeting-sources';

export async function GET() {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const profile = await getOrCreateBrainProfile(result.client.id, result.client.company || 'Company Brain');
  const adapters = await listEnabledAdapters(profile);
  return NextResponse.json({
    success: true,
    data: adapters.map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      icon: a.icon,
    })),
  });
}

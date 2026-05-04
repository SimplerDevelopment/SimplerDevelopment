// API endpoint helpers for the brand profile editor (fetch + save + AI calls).

import type { MessagingData, ProfileData } from './types';

export async function fetchProfile(profileId: string): Promise<{ success: boolean; data?: ProfileData }> {
  const r = await fetch(`/api/portal/branding/profiles/${profileId}`);
  return r.json();
}

export async function fetchMessaging(
  profileId: string,
): Promise<{ success: boolean; data?: Partial<MessagingData> }> {
  const r = await fetch(`/api/portal/branding/messaging?profileId=${profileId}`);
  return r.json();
}

export async function saveProfile(profileId: string, profile: ProfileData): Promise<Response> {
  return fetch(`/api/portal/branding/profiles/${profileId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
}

export async function saveMessaging(profileId: string, messaging: MessagingData): Promise<Response> {
  return fetch('/api/portal/branding/messaging', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...messaging, brandingProfileId: parseInt(profileId, 10) }),
  });
}

export async function generateTheme(description: string): Promise<Response> {
  return fetch('/api/portal/branding/generate-theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
}

export async function generateMessaging(description: string): Promise<Response> {
  return fetch('/api/portal/branding/generate-messaging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
}

export async function rewriteField(payload: {
  fieldName: string;
  fieldLabel: string;
  currentValue: unknown;
  prompt: string;
  companyContext: string;
}): Promise<{ success: boolean; data?: string }> {
  const res = await fetch('/api/portal/branding/rewrite-field', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

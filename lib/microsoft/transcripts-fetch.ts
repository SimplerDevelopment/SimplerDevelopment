import { graphCall } from '@/lib/microsoft/graph-client';
import type {
  MicrosoftConnectionLike,
  MicrosoftOAuthCredentials,
} from '@/lib/microsoft/oauth';

/**
 * Fetch + parse Microsoft Teams meeting transcripts from Graph.
 *
 * Two Graph calls per transcript:
 *   GET /users/{userOid}/onlineMeetings/{meetingId}              — metadata
 *   GET /users/{userOid}/onlineMeetings/{meetingId}/transcripts/ — content
 *       {transcriptId}/content?$format=text/vtt
 *
 * VTT (WebVTT) is the on-the-wire format we ask for. Each cue has a
 * timestamp and a speaker-tagged caption like:
 *
 *   00:00:01.234 --> 00:00:05.678
 *   <v Jane Doe>Hello, how are you?</v>
 *
 * We strip the timestamps + speaker tags and produce a plaintext
 * transcript that the brain pipeline (process-meeting.ts → AI summary,
 * action items) can ingest the same way as Google Meet transcripts.
 */

interface OnlineMeeting {
  id: string;
  subject?: string;
  startDateTime?: string;
  endDateTime?: string;
  joinWebUrl?: string;
  participants?: {
    organizer?: { identity?: { user?: { id?: string; displayName?: string } } };
    attendees?: Array<{ identity?: { user?: { id?: string; displayName?: string } } }>;
  };
}

export interface FetchedTranscript {
  meetingId: string;
  transcriptId: string;
  meetingSubject: string;
  meetingStart: Date | null;
  meetingEnd: Date | null;
  joinWebUrl: string | null;
  participants: { name: string; email?: string }[];
  /** Plain transcript: one line per cue, "Speaker: text". No timestamps. */
  transcript: string;
  /** Raw WebVTT body — preserved on the meeting row for audit / re-parsing. */
  vtt: string;
  refreshed: boolean;
  connection: MicrosoftConnectionLike;
}

export async function fetchTeamsTranscript(args: {
  connection: MicrosoftConnectionLike;
  credentials: MicrosoftOAuthCredentials;
  /** Graph oid of the connected user — meeting belongs to this user. */
  userOid: string;
  meetingId: string;
  transcriptId: string;
}): Promise<FetchedTranscript> {
  // 1) Pull the meeting metadata. /users/{oid}/onlineMeetings/{id} requires
  //    OnlineMeetings.Read (delegated). The connected user must be organizer
  //    or co-organizer for the request to succeed — same constraint as the
  //    transcripts permission itself.
  const metaResult = await graphCall<OnlineMeeting>({
    connection: args.connection,
    credentials: args.credentials,
    call: {
      method: 'GET',
      path:
        `/users/${encodeURIComponent(args.userOid)}` +
        `/onlineMeetings/${encodeURIComponent(args.meetingId)}`,
    },
  });

  // 2) Pull the transcript content as VTT. The text/vtt content type is
  //    requested via $format= query param (NOT the Accept header — Graph
  //    routes the format negotiation through the query string for this
  //    endpoint specifically).
  const vttRes = await fetch(
    'https://graph.microsoft.com/v1.0' +
      `/users/${encodeURIComponent(args.userOid)}` +
      `/onlineMeetings/${encodeURIComponent(args.meetingId)}` +
      `/transcripts/${encodeURIComponent(args.transcriptId)}/content?$format=text/vtt`,
    {
      headers: { Authorization: `Bearer ${metaResult.connection.accessToken}` },
    },
  );

  if (!vttRes.ok) {
    const body = await vttRes.text();
    throw new Error(
      `Graph transcript content fetch failed (${vttRes.status}): ${body.slice(0, 400)}`,
    );
  }
  const vtt = await vttRes.text();
  const transcript = vttToPlainText(vtt);

  const meta = metaResult.data;
  return {
    meetingId: args.meetingId,
    transcriptId: args.transcriptId,
    meetingSubject: meta.subject?.trim() || '(Untitled Teams meeting)',
    meetingStart: parseIso(meta.startDateTime),
    meetingEnd: parseIso(meta.endDateTime),
    joinWebUrl: meta.joinWebUrl ?? null,
    participants: extractParticipants(meta),
    transcript,
    vtt,
    refreshed: metaResult.refreshed,
    connection: metaResult.connection,
  };
}

function parseIso(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractParticipants(meta: OnlineMeeting): { name: string; email?: string }[] {
  const out: { name: string; email?: string }[] = [];
  const seen = new Set<string>();
  const push = (name?: string, id?: string) => {
    const key = (name ?? id ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (name) out.push({ name });
  };
  push(
    meta.participants?.organizer?.identity?.user?.displayName,
    meta.participants?.organizer?.identity?.user?.id,
  );
  for (const a of meta.participants?.attendees ?? []) {
    push(a.identity?.user?.displayName, a.identity?.user?.id);
  }
  return out;
}

/**
 * Strip WebVTT framing and produce one line per cue: "Speaker: text".
 * Joins multi-line cue bodies with a space. Drops timing, identifiers,
 * and the WEBVTT signature.
 */
export function vttToPlainText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    // Skip header line, NOTE blocks, STYLE blocks, REGION blocks, blank lines.
    if (!line || line === 'WEBVTT' || line.startsWith('WEBVTT ')) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) {
      // Consume until the next blank line.
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }

    // Cue: optional identifier, then a timing line, then 1+ payload lines.
    let timingLine = line;
    if (!timingLine.includes('-->')) {
      // The current line was the cue identifier; the next is the timing.
      if (i >= lines.length) break;
      timingLine = lines[i].trim();
      i++;
    }
    if (!timingLine.includes('-->')) continue; // malformed; skip

    const payload: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      payload.push(lines[i]);
      i++;
    }
    const joined = payload.join(' ').trim();
    if (!joined) continue;

    // Speaker tag: <v Speaker Name>text</v>  OR  <v Speaker Name>text
    const m = joined.match(/^<v\s+([^>]+)>\s*([\s\S]*?)(?:<\/v>)?\s*$/i);
    if (m) {
      const speaker = m[1].trim();
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      if (text) out.push(`${speaker}: ${text}`);
    } else {
      const text = joined.replace(/<[^>]+>/g, '').trim();
      if (text) out.push(text);
    }
  }

  return out.join('\n');
}

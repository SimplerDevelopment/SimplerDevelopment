import { NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { clients, clientMembers, users, aiConversations, aiMessages, brainProfiles, brainMeetings } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { PORTAL_TOOLS, executePortalTool } from '@/lib/ai/portal-tools';
import { hasCredits, deductCredits } from '@/lib/ai-credits';
import { resend } from '@/lib/email';
import { processBrainMeeting } from '@/lib/brain/process-meeting';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';

// Shared secret between CF Worker and this endpoint
const INBOUND_SECRET = process.env.INBOUND_EMAIL_SECRET;
if (!INBOUND_SECRET || INBOUND_SECRET === 'sd-inbound-secret-change-me') {
  throw new Error('INBOUND_EMAIL_SECRET env var is required and must not be the placeholder.');
}

const SYSTEM_PROMPT = `You are a helpful AI assistant for Simpler Development. A client is contacting you via email. You have access to tools that query and modify their portal data — projects, invoices, tickets, websites, email campaigns, booking pages, pitch decks, CRM, and more.

Always use the appropriate tool before answering — never guess or make up data.

## Website edit requests (IMPORTANT)
If the client asks to change, add, remove, or edit anything on their website (text, headings, hero content, buttons, images, sections, etc.) you CAN and SHOULD do it directly using the website tools. Do NOT tell them to visit the portal for simple content edits — just make the change.

Recommended workflow for a website edit:
1. Call get_my_websites to find their site(s). If they only have one, use it. Otherwise disambiguate from their request.
2. Call get_website_pages(website_id) to list pages. The homepage is typically the page with slug "/" or "home" (or the only page of post_type "page" if unclear).
3. Call get_page_content(post_id) to read the current blocks. Each block has an "id", a "type" (e.g. "hero", "heading", "text", "cta"), and content fields. Blocks may be nested inside sections/columns/tabs.
4. Identify the target block by matching the user's description ("homepage hero", "the call-to-action", "the About section heading") against block type and content. Hero blocks have type "hero" or "hero-slideshow".
5. For a small change to one block, call update_block_by_id(post_id, block_id, updates) passing only the fields to change as a JSON string. Example: updates='{"title": "Welcome!"}'. To edit a single slide inside a hero-slideshow, pass the full updated slides array.
6. For larger rearrangements, use update_page_blocks with the full modified blocks array.
7. Briefly confirm what was changed in your reply (old → new), and mention that a revision was saved automatically so it can be rolled back.

Interpret edit requests literally but sensibly. "Add '!' to homepage hero" means append an exclamation point to the hero title. "Change the hero title to X" means set title to X. If the request is ambiguous (e.g. multiple hero blocks, unclear which page), ask one concise clarifying question instead of guessing.

## Other guidelines
- You are replying via email, so keep responses concise and well-formatted for email (no markdown links — use plain text URLs if needed).
- Be professional and friendly.
- If a request would be destructive (deleting a page, cancelling services, removing many blocks at once), briefly confirm what you're about to do before doing it.
- Tasks that truly need the visual UI (uploading new images, designing email templates from scratch, pixel-level layout work) — let them know and point to the portal.
- Format currency as dollars (e.g. $1,200.00)
- Do not use markdown headers — use plain text with line breaks.`;

interface InboundAttachment {
  /** R2 object key — `email-attachments/<message-id>/<filename>` */
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

interface InboundPayload {
  secret: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId?: string;
  attachments?: InboundAttachment[];
}

export async function POST(req: Request) {
  try {
    const payload: InboundPayload = await req.json();

    // Verify shared secret
    if (payload.secret !== INBOUND_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { from, to, subject, body: emailBody, messageId, attachments = [] } = payload;

    // Body can be empty for attachment-only emails (e.g. forwarded meeting deck)
    if (!from || !to || (!emailBody && attachments.length === 0)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Extract prefix from to address: prefix@simplerdevelopment.com (supports
    // plus-tagging like brain+<token>@…). The prefix used for client lookup is
    // the part before any '+', so client+anything@… still matches a client.
    const toMatch = to.toLowerCase().match(/^([^@]+)@simplerdevelopment\.com$/);
    if (!toMatch) {
      return NextResponse.json({ error: 'Invalid destination address' }, { status: 400 });
    }
    const fullLocal = toMatch[1];
    const plusIdx = fullLocal.indexOf('+');
    const prefix = plusIdx >= 0 ? fullLocal.slice(0, plusIdx) : fullLocal;
    const tag = plusIdx >= 0 ? fullLocal.slice(plusIdx + 1) : '';

    // Brain ingestion path: brain+<token>@simplerdevelopment.com
    // Token resolves to a brain_profiles row → brain_meetings record.
    // Bypasses the AI chat loop and the per-client emailPrefix scheme.
    if (prefix === 'brain') {
      return handleBrainIngest({ tag, from, to, subject, body: emailBody, messageId, attachments });
    }

    // Look up client by email prefix
    const [client] = await db.select()
      .from(clients)
      .where(eq(clients.emailPrefix, prefix))
      .limit(1);

    if (!client) {
      return NextResponse.json({ error: `No company found for prefix: ${prefix}` }, { status: 404 });
    }

    // Authenticate sender: must be the owner or a team member
    const senderEmail = from.toLowerCase().replace(/.*<([^>]+)>.*/, '$1'); // handle "Name <email>" format

    // Check owner
    const [owner] = await db.select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, client.userId))
      .limit(1);

    let senderId: number | null = null;

    if (owner && owner.email?.toLowerCase() === senderEmail) {
      senderId = owner.id;
    } else {
      // Check team members
      const members = await db.select({ userId: clientMembers.userId, email: users.email })
        .from(clientMembers)
        .innerJoin(users, eq(clientMembers.userId, users.id))
        .where(eq(clientMembers.clientId, client.id));

      const member = members.find(m => m.email?.toLowerCase() === senderEmail);
      if (member) senderId = member.userId;
    }

    if (!senderId) {
      // Unauthorized sender — silent drop (don't leak company info)
      console.log(`[inbound] Rejected email from ${senderEmail} to ${to} — not a member of ${client.company}`);
      return NextResponse.json({ status: 'rejected', reason: 'sender not authorized' });
    }

    // Plan-gate first: Starter without BYOK is blocked.
    const gate = await checkAiPlanGate({ clientId: client.id, provider: 'anthropic' });
    if (!gate.allowed) {
      await resend.emails.send({
        from: `Simpler Development <${process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com'}>`,
        to: senderEmail,
        subject: `Re: ${subject}`,
        text: gate.message ?? 'AI access is not available on the current plan.',
        ...(messageId ? { headers: { 'In-Reply-To': messageId, 'References': messageId } } : {}),
      });
      return NextResponse.json({ status: 'replied', reason: 'plan_gate' });
    }

    // Resolve which key to use (BYOK > platform).
    const resolved = await resolveClientApiKey({ clientId: client.id, provider: 'anthropic' });
    const anthropic = new Anthropic({ apiKey: resolved.key });

    // Check AI credits — only relevant for platform-keyed calls.
    if (resolved.source === 'platform') {
      const canProceed = await hasCredits(client.id);
      if (!canProceed) {
        // Send a reply saying they're out of credits
        await resend.emails.send({
          from: `Simpler Development <${process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com'}>`,
          to: senderEmail,
          subject: `Re: ${subject}`,
          text: `Your AI credits are depleted. Please purchase more credits or enable pay-as-you-go at https://simplerdevelopment.com/portal/dashboard, or add a BYOK key at https://simplerdevelopment.com/portal/integrations/api-keys, to continue using the email assistant.`,
          ...(messageId ? { headers: { 'In-Reply-To': messageId, 'References': messageId } } : {}),
        });
        return NextResponse.json({ status: 'replied', reason: 'insufficient credits' });
      }
    }

    // Create or find conversation (use subject as thread key)
    const threadTitle = `[Email] ${subject || 'No subject'}`;
    const [conv] = await db.insert(aiConversations).values({
      clientId: client.id,
      title: threadTitle,
    }).returning();
    const convId = conv.id;

    // Build the message for Claude
    const userMessage = `Subject: ${subject || '(no subject)'}\n\n${emailBody}`;

    // Agentic tool loop (same as chat route)
    let finalText = '';
    const allToolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let currentMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage },
    ];

    const MAX_LOOPS = 8;
    const MAX_TOOL_CALLS = 20;
    let loopCount = 0;
    let toolCallCount = 0;
    let stopReason: string | null = null;
    while (loopCount < MAX_LOOPS) {
      loopCount++;
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: PORTAL_TOOLS,
        messages: currentMessages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      stopReason = response.stop_reason;

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );

        toolCallCount += toolUseBlocks.length;
        if (toolCallCount > MAX_TOOL_CALLS) {
          throw new Error('Tool-call cap exceeded');
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          const result = await executePortalTool(
            block.name,
            block.input as Record<string, unknown>,
            client.id,
            senderId,
          );
          allToolCalls.push({ name: block.name, input: block.input as Record<string, unknown>, result });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];
      } else {
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');
        break;
      }
    }
    if (loopCount >= MAX_LOOPS && stopReason === 'tool_use') {
      console.warn('[inbound-email] LLM loop hit MAX_LOOPS cap');
    }

    // Save messages to conversation
    await db.insert(aiMessages).values({
      conversationId: convId,
      role: 'user',
      content: userMessage,
      inputTokens: 0,
      outputTokens: 0,
    });

    await db.insert(aiMessages).values({
      conversationId: convId,
      role: 'assistant',
      content: finalText,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    // Update conversation token totals
    await db.update(aiConversations).set({
      totalInputTokens: sql`${aiConversations.totalInputTokens} + ${totalInputTokens}`,
      totalOutputTokens: sql`${aiConversations.totalOutputTokens} + ${totalOutputTokens}`,
      updatedAt: new Date(),
    }).where(eq(aiConversations.id, convId));

    // Deduct credits — only for platform-keyed calls. BYOK skips internal credit accounting.
    const totalTokens = totalInputTokens + totalOutputTokens;
    if (resolved.source === 'platform') {
      await deductCredits(client.id, totalTokens, 'ai', String(convId), `Email assistant: "${subject?.slice(0, 40) || 'No subject'}"`);
    }
    void recordAiUsage({ clientId: client.id, source: resolved.source, tokens: totalTokens });

    // Send reply via Resend
    const replyFrom = `${client.company || 'Simpler Development'} AI <${process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com'}>`;

    await resend.emails.send({
      from: replyFrom,
      to: senderEmail,
      subject: `Re: ${subject || '(no subject)'}`,
      text: finalText,
      ...(messageId ? { headers: { 'In-Reply-To': messageId, 'References': messageId } } : {}),
    });

    return NextResponse.json({
      status: 'replied',
      conversationId: convId,
      tokensUsed: totalTokens,
      toolCalls: allToolCalls.length,
    });
  } catch (err) {
    console.error('[POST /api/email/inbound]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Brain ingestion path: brain+<token>@simplerdevelopment.com →
 * brain_meetings row, source='email'. Token alone authenticates the recipient
 * tenant; the sender email is recorded but not used as an authorization gate
 * (the brain is meant to receive forwards from external participants).
 *
 * Idempotency: brain_meetings has a UNIQUE (client_id, source_ref) index, so
 * the same Message-ID re-delivered (CF retry) updates instead of duplicates.
 */
async function handleBrainIngest(args: {
  tag: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId?: string;
  attachments: InboundAttachment[];
}) {
  const { tag, from, to, subject, body: emailBody, messageId, attachments } = args;

  if (!tag) {
    console.log(`[inbound:brain] no token — to=${to}`);
    return NextResponse.json({ status: 'rejected', reason: 'token required' });
  }

  const [profile] = await db
    .select({
      id: brainProfiles.id,
      clientId: brainProfiles.clientId,
      enabled: brainProfiles.enabled,
      autoProcessEmail: brainProfiles.autoProcessEmail,
    })
    .from(brainProfiles)
    .where(eq(brainProfiles.emailIngestToken, tag))
    .limit(1);

  if (!profile) {
    console.log(`[inbound:brain] unknown token — tag=${tag.slice(0, 6)}…`);
    return NextResponse.json({ status: 'rejected', reason: 'unknown token' });
  }
  if (!profile.enabled) {
    console.log(`[inbound:brain] brain disabled for client=${profile.clientId}`);
    return NextResponse.json({ status: 'rejected', reason: 'brain disabled' });
  }

  const senderEmail = from.toLowerCase().replace(/.*<([^>]+)>.*/, '$1');
  const sourceRef = (messageId || `gen-${Date.now()}`).replace(/[<>]/g, '');

  // Upsert by (client_id, source_ref). On retry, we update transcript +
  // metadata in case the worker re-sent (e.g. attachment upload partially
  // failed and is being retried).
  const [meetingRow] = await db
    .insert(brainMeetings)
    .values({
      clientId: profile.clientId,
      title: subject || '(email)',
      transcript: emailBody,
      status: 'draft',
      source: 'email',
      sourceRef,
      sourceMetadata: {
        from,
        to,
        senderEmail,
        attachments: attachments.map(a => ({
          key: a.key,
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
        })),
      },
    })
    .onConflictDoUpdate({
      target: [brainMeetings.clientId, brainMeetings.sourceRef],
      set: {
        title: subject || '(email)',
        transcript: emailBody,
        sourceMetadata: {
          from,
          to,
          senderEmail,
          attachments: attachments.map(a => ({
            key: a.key,
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
          })),
        },
        updatedAt: new Date(),
      },
    })
    .returning({ id: brainMeetings.id });

  console.log(`[inbound:brain] ingested for client=${profile.clientId} subject="${subject?.slice(0, 60)}" attachments=${attachments.length}`);

  // Auto-process: when the brain profile opted in, run the full AI pipeline
  // (attachment analysis, link OG previews, transcript summary) after the
  // response is sent. `after()` keeps the function alive past the worker's
  // POST without making the worker wait. Resolve the owning user so the
  // transcript processor can attribute the AI job to a real account.
  if (profile.autoProcessEmail && meetingRow) {
    const meetingId = meetingRow.id;
    const clientId = profile.clientId;
    after(async () => {
      try {
        const [client] = await db
          .select({ userId: clients.userId })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);
        if (!client) {
          console.error(`[inbound:brain] auto-process: client ${clientId} not found`);
          return;
        }
        const out = await processBrainMeeting({
          clientId,
          meetingId,
          userId: client.userId,
        });
        console.log(`[inbound:brain] auto-processed meeting=${meetingId} attachments=${out.attachmentsAnalyzed} links=${out.linksExtracted} review=${out.transcript?.reviewItemCount ?? 0}`);
      } catch (err) {
        console.error(`[inbound:brain] auto-process failed for meeting=${meetingId}:`, err);
      }
    });
  }
  return NextResponse.json({ status: 'ingested', clientId: profile.clientId });
}

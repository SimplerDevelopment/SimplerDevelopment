import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients, clientMembers, users, aiConversations, aiMessages } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { PORTAL_TOOLS, executePortalTool } from '@/lib/ai/portal-tools';
import { hasCredits, deductCredits } from '@/lib/ai-credits';
import { resend } from '@/lib/email';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set');
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Shared secret between CF Worker and this endpoint
const INBOUND_SECRET = process.env.INBOUND_EMAIL_SECRET || 'sd-inbound-secret-change-me';

const SYSTEM_PROMPT = `You are a helpful AI assistant for Simpler Development. A client is contacting you via email. You have access to tools that query and modify their portal data — projects, invoices, tickets, websites, email campaigns, booking pages, pitch decks, CRM, and more.

Always use the appropriate tool before answering — never guess or make up data.

## Important
- You are replying via email, so keep responses concise and well-formatted for email (no markdown links — use plain text URLs if needed).
- Be professional and friendly.
- If a request would be destructive (deleting data, cancelling services), confirm what was requested and note that they should confirm via the portal for safety.
- If something requires the visual UI (editing blog posts, designing emails, uploading files), let them know and suggest they visit the portal.
- Format currency as dollars (e.g. $1,200.00)
- Do not use markdown headers — use plain text with line breaks.`;

interface InboundPayload {
  secret: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId?: string;
}

export async function POST(req: Request) {
  try {
    const payload: InboundPayload = await req.json();

    // Verify shared secret
    if (payload.secret !== INBOUND_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { from, to, subject, body: emailBody, messageId } = payload;

    if (!from || !to || !emailBody) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Extract prefix from to address: prefix@simplerdevelopment.com
    const toMatch = to.toLowerCase().match(/^([^@]+)@simplerdevelopment\.com$/);
    if (!toMatch) {
      return NextResponse.json({ error: 'Invalid destination address' }, { status: 400 });
    }
    const prefix = toMatch[1];

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

    // Check AI credits
    const canProceed = await hasCredits(client.id);
    if (!canProceed) {
      // Send a reply saying they're out of credits
      await resend.emails.send({
        from: `Simpler Development <${process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com'}>`,
        to: senderEmail,
        subject: `Re: ${subject}`,
        text: `Your AI credits are depleted. Please purchase more credits or enable pay-as-you-go at https://simplerdevelopment.com/portal/dashboard to continue using the email assistant.`,
        ...(messageId ? { headers: { 'In-Reply-To': messageId, 'References': messageId } } : {}),
      });
      return NextResponse.json({ status: 'replied', reason: 'insufficient credits' });
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

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: PORTAL_TOOLS,
        messages: currentMessages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );

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

    // Deduct credits
    const totalTokens = totalInputTokens + totalOutputTokens;
    await deductCredits(client.id, totalTokens, 'ai', String(convId), `Email assistant: "${subject?.slice(0, 40) || 'No subject'}"`);

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

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, asc, sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { PORTAL_TOOLS, executePortalTool } from '@/lib/ai/portal-tools';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set in environment variables.');
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a helpful AI assistant embedded in the Simpler Development client portal. You help clients understand their project status, invoices, support tickets, and sprint progress.

You have access to real-time tools that query the client's data. Always use the appropriate tool before answering questions about projects, invoices, or tickets — never guess or make up data.

## Linking rules (IMPORTANT)
Whenever you mention a specific entity by name, always make it a markdown link using the ID from the tool result:
- Project → [Project Name](/portal/projects/{id})
- Invoice → [Invoice #number](/portal/invoices/{id})
- Support ticket → [Ticket #number](/portal/tickets/{id})
- Suggested project → [Project Name](/portal/suggested-projects/{id})
- Services (no individual page) → [Services](/portal/services)

Only link to things where you have the actual ID from a tool call. Never fabricate IDs.

## General guidelines
- Be concise, professional, and friendly
- Only answer questions related to the client's work with Simpler Development
- When a client wants to create a support ticket, summarize the details (subject, description, priority, category) and ask them to confirm with "yes" before calling create_support_ticket
- Format currency as dollars (e.g. $1,200.00)
- Format dates in a human-friendly way (e.g. "March 15, 2026")
- Use markdown sparingly — bullet lists are fine for multiple items, but avoid bold/headers for simple one-line answers
- If something is outside your scope, suggest they contact the team directly`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const userId = parseInt(session.user.id, 10);
    const role = (session.user as { role?: string })?.role;
    const isStaff = role === 'admin' || role === 'employee';

    // Staff can't use the client chat widget
    if (isStaff) return NextResponse.json({ success: false, message: 'Staff do not have a client portal chat.' }, { status: 403 });

    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

    const { message, conversationId } = await req.json();
    if (!message?.trim()) return NextResponse.json({ success: false, message: 'message is required' }, { status: 400 });

    // Get or create conversation
    let convId = conversationId as number | undefined;
    if (!convId) {
      // Auto-title from first message (truncated)
      const title = message.trim().slice(0, 80);
      const [conv] = await db.insert(aiConversations).values({
        clientId: client.id,
        title,
      }).returning();
      convId = conv.id;
    } else {
      // Verify this conversation belongs to this client
      const [conv] = await db.select().from(aiConversations)
        .where(eq(aiConversations.id, convId)).limit(1);
      if (!conv || conv.clientId !== client.id) {
        return NextResponse.json({ success: false, message: 'Conversation not found' }, { status: 404 });
      }
    }

    // Load history
    const history = await db.select().from(aiMessages)
      .where(eq(aiMessages.conversationId, convId))
      .orderBy(asc(aiMessages.createdAt));

    // Build Anthropic messages array from history
    const anthropicMessages: Anthropic.MessageParam[] = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Append new user message
    anthropicMessages.push({ role: 'user', content: message.trim() });

    // Agentic tool loop
    let finalText = '';
    const allToolCalls: { name: string; input: Record<string, unknown>; result: unknown }[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let currentMessages = [...anthropicMessages];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
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
            userId,
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
        // end_turn or max_tokens — extract text
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');
        break;
      }
    }

    // Save user message
    await db.insert(aiMessages).values({
      conversationId: convId,
      role: 'user',
      content: message.trim(),
      inputTokens: 0,
      outputTokens: 0,
    });

    // Save assistant message (with tool calls logged)
    await db.insert(aiMessages).values({
      conversationId: convId,
      role: 'assistant',
      content: finalText,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    // Update conversation token totals + updatedAt
    await db.update(aiConversations).set({
      totalInputTokens: sql`${aiConversations.totalInputTokens} + ${totalInputTokens}`,
      totalOutputTokens: sql`${aiConversations.totalOutputTokens} + ${totalOutputTokens}`,
      updatedAt: new Date(),
    }).where(eq(aiConversations.id, convId));

    return NextResponse.json({
      success: true,
      data: {
        conversationId: convId,
        reply: finalText,
        toolCalls: allToolCalls.map(tc => ({ name: tc.name, input: tc.input })),
      },
    });
  } catch (err) {
    console.error('[POST /api/portal/ai/chat]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

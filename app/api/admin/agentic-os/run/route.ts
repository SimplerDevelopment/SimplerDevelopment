/**
 * POST /api/admin/agentic-os/run
 *
 * Start a headless `claude -p <prompt>` run for an on-demand skill.
 *
 * Body: { skillId: string, variables: Record<string,string> }
 *
 * The handler returns 200 with { success: true, data: { runId } } as soon as
 * the child is spawned — the work then continues in the background and the
 * caller picks up the stream via /api/admin/agentic-os/runs/:id/stream. If the
 * executor is disabled the run is still persisted (status='unavailable') so
 * the audit log shows the attempt; in that case we return 503.
 */
import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agenticOsRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { SKILLS_BY_ID } from '@/lib/agentic-os/registry';
import { isOnDemand, renderPromptTemplate } from '@/lib/agentic-os/types';
import {
  appendOutput,
  executorEnabled,
  makeStreamJsonParser,
  MAX_OUTPUT_BYTES,
  registerChild,
  resolveClaudeBin,
  truncatePrompt,
  unregisterChild,
  type ChildEntry,
} from '@/lib/agentic-os/executor';
import { isLocalDev } from '@/lib/agentic-os/local-only';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

function truncateForOutput(s: string): string {
  if (!s) return s;
  if (s.length <= MAX_OUTPUT_BYTES) return s;
  return s.slice(0, MAX_OUTPUT_BYTES) + '\n[truncated]\n';
}

export async function POST(request: Request) {
  if (!isLocalDev()) return new NextResponse(null, { status: 404 });
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────
  let body: { skillId?: unknown; variables?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const skillId = typeof body.skillId === 'string' ? body.skillId : '';
  if (!skillId) {
    return NextResponse.json(
      { success: false, message: 'skillId is required' },
      { status: 400 }
    );
  }
  const variables: Record<string, string> = {};
  if (body.variables && typeof body.variables === 'object') {
    for (const [k, v] of Object.entries(body.variables as Record<string, unknown>)) {
      if (typeof v === 'string') variables[k] = v;
      else if (v == null) variables[k] = '';
      else variables[k] = String(v);
    }
  }

  // ── Skill lookup + on-demand check ───────────────────────────────────
  const skill = SKILLS_BY_ID[skillId];
  if (!skill) {
    return NextResponse.json(
      { success: false, message: `Unknown skillId: ${skillId}` },
      { status: 404 }
    );
  }
  if (!isOnDemand(skill)) {
    return NextResponse.json(
      {
        success: false,
        message:
          'This skill is not on-demand; scheduled/cloud skills cannot be hand-triggered through this route',
      },
      { status: 400 }
    );
  }

  // ── Validate required variables ──────────────────────────────────────
  const missing = skill.variables
    .filter((v) => v.required && !(variables[v.key] && variables[v.key].length > 0))
    .map((v) => v.key);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        success: false,
        message: `Missing required variables: ${missing.join(', ')}`,
      },
      { status: 400 }
    );
  }

  // ── Render prompt + persist pending row ──────────────────────────────
  const renderedPrompt = renderPromptTemplate(skill.promptTemplate, variables);
  const prompt = truncatePrompt(renderedPrompt);

  const userIdNum = Number.parseInt(String(session.user!.id), 10);
  const createdBy = Number.isFinite(userIdNum) ? userIdNum : null;

  const [inserted] = await db
    .insert(agenticOsRuns)
    .values({
      skillId,
      prompt,
      variables,
      status: 'pending',
      createdBy,
      host: os.hostname().slice(0, 64),
    })
    .returning({ id: agenticOsRuns.id });

  const runId = inserted.id;

  // ── Executor gate ────────────────────────────────────────────────────
  if (!executorEnabled()) {
    await db
      .update(agenticOsRuns)
      .set({
        status: 'unavailable',
        errorMessage:
          'Executor disabled on this host (AGENTIC_OS_EXECUTOR_ENABLED!=1 or `claude` CLI not on PATH)',
        completedAt: new Date(),
      })
      .where(eq(agenticOsRuns.id, runId));

    return NextResponse.json(
      {
        success: false,
        message: 'Executor disabled on this host',
        data: { runId },
      },
      { status: 503 }
    );
  }

  const claudeBin = resolveClaudeBin();
  if (!claudeBin) {
    // resolveClaudeBin already returned null inside executorEnabled — be paranoid.
    await db
      .update(agenticOsRuns)
      .set({
        status: 'unavailable',
        errorMessage: '`claude` CLI not found on PATH',
        completedAt: new Date(),
      })
      .where(eq(agenticOsRuns.id, runId));
    return NextResponse.json(
      {
        success: false,
        message: 'Executor disabled on this host',
        data: { runId },
      },
      { status: 503 }
    );
  }

  // ── Spawn child ──────────────────────────────────────────────────────
  const startedAt = new Date();
  await db
    .update(agenticOsRuns)
    .set({ status: 'running', startedAt })
    .where(eq(agenticOsRuns.id, runId));

  // `--output-format stream-json --verbose` emits one JSON event per line.
  // We parse each line and surface assistant text, tool_use, tool_result, and
  // the final `result` event (with cost + token usage) as readable output.
  // Without these flags, `claude -p` buffers the entire response until exit
  // and the SSE stream looks frozen.
  const child = spawn(
    claudeBin,
    ['-p', '--output-format', 'stream-json', '--verbose', prompt],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Avoid Next.js' --inspect-brk / NODE_OPTIONS leaking into the subprocess.
        NODE_OPTIONS: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const entry: ChildEntry = {
    runId,
    child,
    startedAt: startedAt.getTime(),
    outputBuf: '',
    outputBytes: 0,
    outputTruncated: false,
    taps: new Set(),
    stderrTail: '',
  };
  registerChild(entry);

  const parseStream = makeStreamJsonParser();
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    const formatted = parseStream(chunk);
    if (formatted) appendOutput(entry, formatted);
  });

  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    // Track stderr separately for the errorMessage, but also fold into the
    // streamed output so the UI shows it inline with stdout.
    entry.stderrTail = (entry.stderrTail + chunk).slice(-4096);
    appendOutput(entry, `[stderr] ${chunk}`);
  });

  const finalize = async (
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    threw: Error | null
  ) => {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - entry.startedAt;
    // If we were SIGTERM'd by the cancel route it will already have flipped
    // status='cancelled' — don't clobber that.
    let status: 'succeeded' | 'failed' = exitCode === 0 ? 'succeeded' : 'failed';
    let errorMessage: string | null = null;
    if (threw) {
      status = 'failed';
      errorMessage = threw.message;
    } else if (exitCode !== 0) {
      errorMessage =
        entry.stderrTail.trim() ||
        (signal ? `terminated by ${signal}` : `exited with code ${exitCode ?? 'null'}`);
    }

    try {
      // Only overwrite status if it's still 'running' — preserves 'cancelled'.
      const current = await db
        .select({ status: agenticOsRuns.status })
        .from(agenticOsRuns)
        .where(eq(agenticOsRuns.id, runId))
        .limit(1);
      const currentStatus = current[0]?.status;

      if (currentStatus === 'cancelled') {
        await db
          .update(agenticOsRuns)
          .set({
            output: truncateForOutput(entry.outputBuf),
            exitCode,
            durationMs,
            completedAt,
          })
          .where(eq(agenticOsRuns.id, runId));
      } else {
        await db
          .update(agenticOsRuns)
          .set({
            status,
            output: truncateForOutput(entry.outputBuf),
            exitCode,
            errorMessage,
            durationMs,
            completedAt,
          })
          .where(eq(agenticOsRuns.id, runId));
      }
    } finally {
      unregisterChild(runId);
    }
  };

  child.on('error', (err) => {
    void finalize(null, null, err);
  });
  child.on('exit', (code, signal) => {
    void finalize(code, signal, null);
  });

  return NextResponse.json(
    { success: true, data: { runId } },
    { status: 200 }
  );
}

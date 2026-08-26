import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateProjectSurvey } from '@/lib/projects/generate-survey-service';
import type { ProjectSurveyPreset } from '@/lib/projects/generate-survey';

const VALID_PRESETS: ProjectSurveyPreset[] = ['qa_review', 'stakeholder_feedback', 'retro'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// Same shape as the sibling app/api/portal/projects/[id]/artifacts/route.ts
// auth helper: resolve the session, look up the project by id, and gate
// non-staff callers by matching their portal client to the project's
// clientId. Kept local (not imported) because that route doesn't export it.
async function getAuthedProject(projectId: number) {
  const [session, projectRows] = await Promise.all([
    auth(),
    db
      .select({ id: projects.id, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  ]);
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);

  const project = projectRows[0];
  if (!project) return { error: NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 }) };

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
    }
  }

  return { userId, project, clientId: project.clientId };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedProject(projectId);
  if ('error' in result) return result.error;

  const body = await req.json().catch(() => ({}));
  const { preset, date } = body ?? {};

  if (typeof preset !== 'string' || !VALID_PRESETS.includes(preset as ProjectSurveyPreset)) {
    return NextResponse.json(
      { success: false, error: `preset must be one of: ${VALID_PRESETS.join(', ')}` },
      { status: 400 },
    );
  }
  if (date !== undefined && typeof date !== 'string') {
    return NextResponse.json({ success: false, error: 'date must be a string' }, { status: 400 });
  }

  const generated = await generateProjectSurvey({
    clientId: result.clientId,
    projectId,
    preset: preset as ProjectSurveyPreset,
    createdByUserId: result.userId,
    date,
  });

  if (!generated.ok) {
    return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: generated }, { status: 201 });
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { collectKanbanTasks, collectBrainTasks } from '@/lib/portal/my-tasks-collect';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  const url = new URL(req.url);
  const openOnly = url.searchParams.get('openOnly') !== '0';

  const [kanbanGroups, brainGroups] = await Promise.all([
    collectKanbanTasks({ userId, isStaff, openOnly }),
    collectBrainTasks({ userId, isStaff, openOnly }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      projects: [...kanbanGroups, ...brainGroups],
    },
  });
}

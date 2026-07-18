import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq, and, ne, count } from 'drizzle-orm';
import MetricBlock from './MetricBlock';

export default async function MetricActiveProjectsWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [result] = await db
    .select({ count: count() })
    .from(projects)
    .where(and(eq(projects.clientId, clientId), ne(projects.status, 'archived')));

  return (
    <MetricBlock
      icon="view_kanban"
      color="text-blue-600"
      value={result?.count ?? 0}
      label="Active Projects"
    />
  );
}

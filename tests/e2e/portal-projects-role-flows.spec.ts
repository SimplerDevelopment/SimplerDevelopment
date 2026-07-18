/**
 * Portal Projects — Role-based access flows
 *
 * Covers the project_members migration:
 *   - Clone-from-source on create copies columns/labels/templates (NOT cards) and
 *     returns myRole === 'owner'.
 *   - Members tab CRUD (list/add/update/remove) via /api/portal/projects/[id]/members.
 *   - Role demotion (editor -> viewer) revokes card edit permission.
 *
 * Tagged @critical so the suite runs in `bun test:critical`.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestKanbanProject,
  createTestKanbanCard,
  createTestTeamMember,
} from './setup/helpers';

type ProjectRole = 'owner' | 'editor' | 'commenter' | 'viewer';

type ProjectResponse = {
  id: number;
  name: string;
  projectKey: string | null;
  status: string;
  isPrivate: boolean;
  myRole: ProjectRole;
};

type MemberRow = {
  id: number;
  userId: number;
  role: ProjectRole;
  name: string | null;
  email: string;
};

test.describe('Portal Projects — role flows @pm @projects @members @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  // ── Flow 1 ────────────────────────────────────────────────────────────────
  test('clone-from-source copies columns, labels, templates but NOT cards', async ({ clientApi }) => {
    // Build a source project with at least 1 column, 1 label, 1 card, 1 template.
    const { project: source, columns: srcColumns, cleanup: srcCleanup } =
      await createTestKanbanProject(clientApi);
    cleanups.push(srcCleanup);

    const labelRes = await clientApi.post(`/api/portal/projects/${source.id}/labels`, {
      name: `Bug ${Date.now()}`,
      color: '#ef4444',
    });
    expect(labelRes.status).toBe(201);
    expect(labelRes.data?.success).toBe(true);

    const { card: srcCard, cleanup: srcCardCleanup } =
      await createTestKanbanCard(clientApi, srcColumns[0].id, { title: 'Source-only card' });
    cleanups.push(srcCardCleanup);
    expect(srcCard.id).toBeTruthy();

    const tplRes = await clientApi.post(`/api/portal/projects/${source.id}/card-templates`, {
      name: `Template ${Date.now()}`,
      description: 'E2E template',
      payload: { title: 'From template', priority: 'medium' },
    });
    expect(tplRes.status).toBe(201);
    expect(tplRes.data?.success).toBe(true);

    // Snapshot source counts so the assertions don't depend on hard-coded numbers
    // (createTestKanbanProject seeds 4 columns; project may grow other defaults later).
    const srcColumnsList = await clientApi.get(`/api/portal/projects/${source.id}/columns`);
    const srcLabelsList = await clientApi.get(`/api/portal/projects/${source.id}/labels`);
    const srcTemplatesList = await clientApi.get(`/api/portal/projects/${source.id}/card-templates`);
    expect(srcColumnsList.status).toBe(200);
    expect(srcLabelsList.status).toBe(200);
    expect(srcTemplatesList.status).toBe(200);
    const srcColumnsCount = (srcColumnsList.data.data as unknown[]).length;
    // Templates GET returns project-scoped + client-wide rows; only project-scoped clone over.
    const srcProjectTemplatesCount = (srcTemplatesList.data.data as Array<{ projectId: number | null }>).filter(
      (t) => t.projectId === source.id,
    ).length;
    const srcLabelsCount = (srcLabelsList.data.data as unknown[]).length;
    expect(srcColumnsCount).toBeGreaterThanOrEqual(1);
    expect(srcLabelsCount).toBeGreaterThanOrEqual(1);
    expect(srcProjectTemplatesCount).toBeGreaterThanOrEqual(1);

    // Clone via POST /api/portal/projects with cloneFromProjectId.
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const cloneRes = await clientApi.post('/api/portal/projects', {
      name: `Clone of source ${ts}-${rand}`,
      cloneFromProjectId: source.id,
    });
    expect(cloneRes.status).toBe(201);
    expect(cloneRes.data?.success).toBe(true);
    const cloned = cloneRes.data.data as ProjectResponse;
    expect(cloned.id).toBeTruthy();
    expect(cloned.id).not.toBe(source.id);
    expect(cloned.myRole).toBe('owner');

    cleanups.push(async () => {
      await clientApi
        .patch(`/api/portal/projects/${cloned.id}`, {
          status: 'archived',
          name: `[archived-e2e] ${cloned.name}`,
        })
        .catch(() => {});
    });

    // Cloned project should mirror source counts for columns/labels/project-scoped templates.
    const cloneColumnsList = await clientApi.get(`/api/portal/projects/${cloned.id}/columns`);
    const cloneLabelsList = await clientApi.get(`/api/portal/projects/${cloned.id}/labels`);
    const cloneTemplatesList = await clientApi.get(`/api/portal/projects/${cloned.id}/card-templates`);
    expect(cloneColumnsList.status).toBe(200);
    expect(cloneLabelsList.status).toBe(200);
    expect(cloneTemplatesList.status).toBe(200);

    expect((cloneColumnsList.data.data as unknown[]).length).toBe(srcColumnsCount);
    expect((cloneLabelsList.data.data as unknown[]).length).toBe(srcLabelsCount);
    const clonedProjectTemplatesCount = (
      cloneTemplatesList.data.data as Array<{ projectId: number | null }>
    ).filter((t) => t.projectId === cloned.id).length;
    expect(clonedProjectTemplatesCount).toBe(srcProjectTemplatesCount);

    // Cards are intentionally NOT cloned — assert zero on the new project.
    const cloneCardsList = await clientApi.get(`/api/portal/projects/${cloned.id}/cards`);
    expect(cloneCardsList.status).toBe(200);
    const cardCount = Array.isArray(cloneCardsList.data?.data)
      ? (cloneCardsList.data.data as unknown[]).length
      : Array.isArray(cloneCardsList.data?.data?.cards)
        ? (cloneCardsList.data.data.cards as unknown[]).length
        : 0;
    expect(cardCount).toBe(0);
  });

  // ── Flow 2 ────────────────────────────────────────────────────────────────
  test('members tab CRUD: list, add editor, demote to viewer, remove', async ({ clientApi }) => {
    const { project, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);

    // Initial GET — creator is the only member, role 'owner'.
    const initial = await clientApi.get(`/api/portal/projects/${project.id}/members`);
    expect(initial.status).toBe(200);
    expect(initial.data?.success).toBe(true);
    const initialRows = initial.data.data as MemberRow[];
    expect(initialRows.length).toBe(1);
    expect(initialRows[0].role).toBe('owner');
    const ownerUserId = initialRows[0].userId;
    expect(ownerUserId).toBeTruthy();

    // Invite a fresh member into the same client tenancy.
    const { userId: inviteeUserId, cleanup: inviteeCleanup } = await createTestTeamMember(clientApi);
    cleanups.push(inviteeCleanup);

    // POST as 'editor'.
    const addRes = await clientApi.post(`/api/portal/projects/${project.id}/members`, {
      userId: inviteeUserId,
      role: 'editor',
    });
    expect(addRes.status).toBe(201);
    expect(addRes.data?.success).toBe(true);
    expect(addRes.data.data.role).toBe('editor');

    // PATCH down to 'viewer'.
    const patchRes = await clientApi.patch(`/api/portal/projects/${project.id}/members`, {
      userId: inviteeUserId,
      role: 'viewer',
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data?.success).toBe(true);
    expect(patchRes.data.data.role).toBe('viewer');

    // DELETE removes the member.
    const delRes = await clientApi.delete(
      `/api/portal/projects/${project.id}/members?userId=${inviteeUserId}`,
    );
    expect(delRes.status).toBe(200);
    expect(delRes.data?.success).toBe(true);

    // Re-GET — only the owner remains.
    const afterRemove = await clientApi.get(`/api/portal/projects/${project.id}/members`);
    expect(afterRemove.status).toBe(200);
    const afterRows = afterRemove.data.data as MemberRow[];
    expect(afterRows.length).toBe(1);
    expect(afterRows[0].role).toBe('owner');
    expect(afterRows[0].userId).toBe(ownerUserId);
  });

  // ── Flow 3 ────────────────────────────────────────────────────────────────
  test('demoting editor to viewer revokes card PATCH permission', async ({ clientApi }) => {
    const { project, columns, cleanup: projCleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(projCleanup);

    const { card, cleanup: cardCleanup } = await createTestKanbanCard(clientApi, columns[0].id, {
      title: 'Role-test card',
    });
    cleanups.push(cardCleanup);

    // Add a second user as 'editor' and confirm they can PATCH the card.
    const { memberApi, userId: memberUserId, cleanup: memberCleanup } =
      await createTestTeamMember(clientApi);
    cleanups.push(memberCleanup);

    const addRes = await clientApi.post(`/api/portal/projects/${project.id}/members`, {
      userId: memberUserId,
      role: 'editor',
    });
    expect(addRes.status).toBe(201);
    expect(addRes.data?.success).toBe(true);

    const editorPatch = await memberApi.patch(`/api/portal/cards/${card.id}`, {
      title: 'Renamed by editor',
    });
    expect(editorPatch.status).toBe(200);
    expect(editorPatch.data?.success).toBe(true);

    // Demote to 'viewer'. Same PATCH should now be 403.
    const demote = await clientApi.patch(`/api/portal/projects/${project.id}/members`, {
      userId: memberUserId,
      role: 'viewer',
    });
    expect(demote.status).toBe(200);
    expect(demote.data?.success).toBe(true);
    expect(demote.data.data.role).toBe('viewer');

    const viewerPatch = await memberApi.patch(`/api/portal/cards/${card.id}`, {
      title: 'Viewer should not be able to do this',
    });
    expect(viewerPatch.status).toBe(403);
    expect(viewerPatch.data?.success).toBe(false);
  });
});

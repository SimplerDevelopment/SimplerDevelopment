/**
 * Custom Fields E2E Tests
 *
 * Tests for custom field definitions (including repeater and group types),
 * custom field values on posts, and the PUT upsert endpoint.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite, createTestPost } from './setup/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Custom Fields CRUD @cms @custom-fields', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let postTypeId: number;

  test('setup: create test website and resolve post type', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    siteId = website.id;

    // Get or create a post type for testing
    const ptRes = await clientApi.get('/api/post-types');
    expect(ptRes.status).toBe(200);
    const pageType = ptRes.data.data.find((pt: { slug: string }) => pt.slug === 'page');
    if (pageType) {
      postTypeId = pageType.id;
    } else {
      const createRes = await clientApi.post('/api/post-types', {
        name: 'Page',
        slug: 'page',
        description: 'Standard page',
        icon: 'article',
        active: true,
      });
      expect(createRes.status).toBe(201);
      postTypeId = createRes.data.data.id;
      cleanups.push(async () => {
        await clientApi.delete(`/api/post-types/${postTypeId}`).catch(() => {});
      });
    }
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  // ── Basic field CRUD ──────────────────────────────────────────────────

  test('POST creates a text custom field', async ({ clientApi }) => {
    const res = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'Author',
      slug: `author_${Date.now()}`,
      fieldType: 'text',
      required: true,
      helpText: 'Post author name',
      order: 0,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe('Author');
    expect(res.data.data.fieldType).toBe('text');
    expect(res.data.data.required).toBe(true);

    cleanups.push(async () => {
      await clientApi.delete(`/api/custom-fields/${res.data.data.id}`).catch(() => {});
    });
  });

  test('GET lists custom fields filtered by postTypeId', async ({ clientApi }) => {
    const slug = `filterable_${Date.now()}`;
    const createRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'Filterable',
      slug,
      fieldType: 'text',
      order: 0,
    });
    expect(createRes.status).toBe(201);
    const fieldId = createRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/custom-fields/${fieldId}`).catch(() => {});
    });

    const listRes = await clientApi.get(`/api/custom-fields?postTypeId=${postTypeId}`);
    expect(listRes.status).toBe(200);
    expect(listRes.data.success).toBe(true);
    expect(listRes.data.data.some((f: { id: number }) => f.id === fieldId)).toBe(true);
  });

  test('PUT updates a custom field', async ({ clientApi }) => {
    const slug = `updatable_${Date.now()}`;
    const createRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'Updatable',
      slug,
      fieldType: 'text',
      order: 0,
    });
    const fieldId = createRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/custom-fields/${fieldId}`).catch(() => {});
    });

    const updateRes = await clientApi.put(`/api/custom-fields/${fieldId}`, {
      name: 'Updated Name',
      helpText: 'Updated help',
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.data.data.name).toBe('Updated Name');
    expect(updateRes.data.data.helpText).toBe('Updated help');
  });

  test('DELETE removes a custom field', async ({ clientApi }) => {
    const slug = `deletable_${Date.now()}`;
    const createRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'Deletable',
      slug,
      fieldType: 'checkbox',
      order: 0,
    });
    const fieldId = createRes.data.data.id;

    const delRes = await clientApi.delete(`/api/custom-fields/${fieldId}`);
    expect(delRes.status).toBe(200);

    const getRes = await clientApi.get(`/api/custom-fields/${fieldId}`);
    expect(getRes.status).toBe(404);
  });

  // ── Repeater fields ───────────────────────────────────────────────────

  test('POST creates a repeater field with sub-fields', async ({ clientApi }) => {
    const ts = Date.now();

    // Create repeater parent
    const repeaterRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'Team Members',
      slug: `team_members_${ts}`,
      fieldType: 'repeater',
      order: 0,
    });
    expect(repeaterRes.status).toBe(201);
    expect(repeaterRes.data.data.fieldType).toBe('repeater');
    const repeaterId = repeaterRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/custom-fields/${repeaterId}`).catch(() => {});
    });

    // Create sub-fields
    const nameRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      parentId: repeaterId,
      name: 'Member Name',
      slug: `member_name_${ts}`,
      fieldType: 'text',
      required: true,
      order: 0,
    });
    expect(nameRes.status).toBe(201);
    expect(nameRes.data.data.parentId).toBe(repeaterId);

    const roleRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      parentId: repeaterId,
      name: 'Role',
      slug: `role_${ts}`,
      fieldType: 'text',
      order: 1,
    });
    expect(roleRes.status).toBe(201);

    // Verify sub-fields appear in filtered list
    const listRes = await clientApi.get(`/api/custom-fields?postTypeId=${postTypeId}`);
    const subFields = listRes.data.data.filter((f: { parentId: number | null }) => f.parentId === repeaterId);
    expect(subFields.length).toBe(2);
  });

  test('DELETE repeater cascades to sub-fields', async ({ clientApi }) => {
    const ts = Date.now();

    const repeaterRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'Cascade Test',
      slug: `cascade_${ts}`,
      fieldType: 'repeater',
      order: 0,
    });
    const repeaterId = repeaterRes.data.data.id;

    const subRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      parentId: repeaterId,
      name: 'Sub Field',
      slug: `sub_${ts}`,
      fieldType: 'text',
      order: 0,
    });
    const subId = subRes.data.data.id;

    // Delete repeater
    await clientApi.delete(`/api/custom-fields/${repeaterId}`);

    // Sub-field should be gone too
    const getRes = await clientApi.get(`/api/custom-fields/${subId}`);
    expect(getRes.status).toBe(404);
  });

  // ── Group fields ──────────────────────────────────────────────────────

  test('POST creates a group field with sub-fields', async ({ clientApi }) => {
    const ts = Date.now();

    const groupRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'SEO Settings',
      slug: `seo_settings_${ts}`,
      fieldType: 'group',
      order: 0,
    });
    expect(groupRes.status).toBe(201);
    expect(groupRes.data.data.fieldType).toBe('group');
    const groupId = groupRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/custom-fields/${groupId}`).catch(() => {});
    });

    const titleRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      parentId: groupId,
      name: 'Meta Title',
      slug: `meta_title_${ts}`,
      fieldType: 'text',
      order: 0,
    });
    expect(titleRes.status).toBe(201);
    expect(titleRes.data.data.parentId).toBe(groupId);
  });

  // ── Field values (PUT upsert + GET) ───────────────────────────────────

  test('PUT upserts custom field values on a post', async ({ clientApi }) => {
    const ts = Date.now();

    // Create a field
    const fieldRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'Rating',
      slug: `rating_${ts}`,
      fieldType: 'number',
      order: 0,
    });
    const fieldId = fieldRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/custom-fields/${fieldId}`).catch(() => {});
    });

    // Create a post
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    cleanups.push(cleanup);

    // PUT value (insert)
    const putRes = await clientApi.put(`/api/posts/${post.id}/custom-fields`, {
      customFieldId: fieldId,
      value: '5',
    });
    expect(putRes.status).toBe(200);
    expect(putRes.data.success).toBe(true);

    // GET values
    const getRes = await clientApi.get(`/api/posts/${post.id}/custom-fields`);
    expect(getRes.status).toBe(200);
    const val = getRes.data.data.find((v: { customFieldId: number }) => v.customFieldId === fieldId);
    expect(val).toBeTruthy();
    expect(val.value).toBe('5');

    // PUT value (update)
    const put2 = await clientApi.put(`/api/posts/${post.id}/custom-fields`, {
      customFieldId: fieldId,
      value: '10',
    });
    expect(put2.status).toBe(200);

    const get2 = await clientApi.get(`/api/posts/${post.id}/custom-fields`);
    const val2 = get2.data.data.find((v: { customFieldId: number }) => v.customFieldId === fieldId);
    expect(val2.value).toBe('10');
  });

  test('PUT stores repeater value as JSON array', async ({ clientApi }) => {
    const ts = Date.now();

    // Create repeater with sub-fields
    const repeaterRes = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'FAQ',
      slug: `faq_${ts}`,
      fieldType: 'repeater',
      order: 0,
    });
    const repeaterId = repeaterRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/custom-fields/${repeaterId}`).catch(() => {});
    });

    await clientApi.post('/api/custom-fields', {
      postTypeId,
      parentId: repeaterId,
      name: 'Question',
      slug: `question_${ts}`,
      fieldType: 'text',
      order: 0,
    });
    await clientApi.post('/api/custom-fields', {
      postTypeId,
      parentId: repeaterId,
      name: 'Answer',
      slug: `answer_${ts}`,
      fieldType: 'textarea',
      order: 1,
    });

    // Create post and store repeater value
    const { post, cleanup } = await createTestPost(clientApi, siteId);
    cleanups.push(cleanup);

    const repeaterValue = JSON.stringify([
      { [`question_${ts}`]: 'What is this?', [`answer_${ts}`]: 'A test.' },
      { [`question_${ts}`]: 'Does it work?', [`answer_${ts}`]: 'Yes!' },
    ]);

    const putRes = await clientApi.put(`/api/posts/${post.id}/custom-fields`, {
      customFieldId: repeaterId,
      value: repeaterValue,
    });
    expect(putRes.status).toBe(200);

    // Verify the JSON round-trips correctly
    const getRes = await clientApi.get(`/api/posts/${post.id}/custom-fields`);
    const val = getRes.data.data.find((v: { customFieldId: number }) => v.customFieldId === repeaterId);
    expect(val).toBeTruthy();
    const parsed = JSON.parse(val.value);
    expect(parsed).toHaveLength(2);
    expect(parsed[0][`question_${ts}`]).toBe('What is this?');
    expect(parsed[1][`answer_${ts}`]).toBe('Yes!');
  });

  // ── Validation ────────────────────────────────────────────────────────

  test('POST rejects invalid field types', async ({ clientApi }) => {
    const res = await clientApi.post('/api/custom-fields', {
      postTypeId,
      name: 'Bad',
      slug: 'bad',
      fieldType: 'invalid_type',
      order: 0,
    });
    expect(res.status).toBe(400);
  });

  test('POST accepts all valid field types including repeater and group', async ({ clientApi }) => {
    for (const fieldType of ['repeater', 'group']) {
      const ts = Date.now();
      const res = await clientApi.post('/api/custom-fields', {
        postTypeId,
        name: `${fieldType} test`,
        slug: `${fieldType}_valid_${ts}`,
        fieldType,
        order: 0,
      });
      expect(res.status).toBe(201);
      cleanups.push(async () => {
        await clientApi.delete(`/api/custom-fields/${res.data.data.id}`).catch(() => {});
      });
    }
  });
});

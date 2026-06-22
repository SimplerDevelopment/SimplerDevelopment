/**
 * CMS reference fields @gap @cms-reference
 *
 * A 'reference' custom field links one post to another. This covers: the field
 * type is creatable (enum), a value is validated to point at a real post on
 * write, and the value resolves to a referenced-post summary on read.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, resolveClientSiteId, createTestPost } from './setup/helpers';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('CMS reference fields @gap @cms-reference', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let hostId: number;
  let refId: number;
  let postTypeId: number;
  let fieldId: number;

  test.beforeAll(async ({ clientApi }) => {
    siteId = await resolveClientSiteId(clientApi);
    const host = await createTestPost(clientApi, siteId, { published: false });
    const referenced = await createTestPost(clientApi, siteId, { published: true });
    hostId = host.post.id;
    refId = referenced.post.id;
    cleanups.push(host.cleanup, referenced.cleanup);

    const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
    postTypeId = parseInt(sql(`INSERT INTO post_types (name, slug, website_id) VALUES ('RefType','reftype-${tag}', ${siteId}) RETURNING id`), 10);
    fieldId = parseInt(sql(`INSERT INTO custom_fields (post_type_id, name, slug, field_type) VALUES (${postTypeId}, 'Related', 'related', 'reference') RETURNING id`), 10);
  });

  test.afterAll(async () => {
    sql(`DELETE FROM custom_fields WHERE id=${fieldId}`);
    sql(`DELETE FROM post_types WHERE id=${postTypeId}`);
    await runCleanups(cleanups);
  });

  test('PUT validates the reference points at a real post; GET resolves it', async ({ request }) => {
    const put = await request.put(`/api/posts/${hostId}/custom-fields`, {
      data: { customFieldId: fieldId, value: String(refId) },
    });
    expect(put.status()).toBe(200);

    const get = await request.get(`/api/posts/${hostId}/custom-fields`);
    expect(get.status()).toBe(200);
    const body = await get.json();
    const row = (body.data as Array<{ customFieldId: number; fieldType: string; referencedPosts?: Array<{ id: number; title: string; slug: string }> }>)
      .find((v) => v.customFieldId === fieldId);
    expect(row?.fieldType).toBe('reference');
    expect(row?.referencedPosts?.[0]?.id).toBe(refId);
    expect(typeof row?.referencedPosts?.[0]?.title).toBe('string');
  });

  test('PUT rejects a reference to a non-existent post (400) and a non-id value (400)', async ({ request }) => {
    expect((await request.put(`/api/posts/${hostId}/custom-fields`, { data: { customFieldId: fieldId, value: '999999' } })).status()).toBe(400);
    expect((await request.put(`/api/posts/${hostId}/custom-fields`, { data: { customFieldId: fieldId, value: 'abc' } })).status()).toBe(400);
  });

  test("'reference' is an accepted field type on the content-types fields route", async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/cms/websites/${siteId}/content-types/${postTypeId}/fields`, {
      name: 'Related posts',
      slug: `related-posts-${Date.now().toString(36)}`,
      fieldType: 'reference',
    });
    // The key assertion: 'reference' is NOT rejected as an invalid field type (400 on the enum).
    expect(res.status).not.toBe(400);
  });
});

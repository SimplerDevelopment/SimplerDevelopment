/**
 * Abandoned-cart recovery @gap @cart-abandonment
 *
 * The process-cart-abandonment cron flags active carts left >1h with items as
 * abandoned + mints a recovery token; the recover route reactivates them.
 */
import { test, expect } from './setup/fixtures';
import { resolveClientSiteId } from './setup/helpers';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('Abandoned-cart recovery @gap @cart-abandonment', () => {
  let siteId: number;
  let productId: number;
  let oldCartId: number;
  let recentCartId: number;

  test.afterAll(async () => {
    const ids = [oldCartId, recentCartId].filter(Boolean);
    if (ids.length) {
      sql(`DELETE FROM cart_items WHERE cart_id IN (${ids.join(',')})`);
      sql(`DELETE FROM carts WHERE id IN (${ids.join(',')})`);
    }
  });

  function seedCart(ageHours: number): number {
    const id = parseInt(sql(`INSERT INTO carts (website_id, status, customer_email, updated_at) VALUES (${siteId}, 'active', 'abandon-${Date.now()}-${ageHours}@example.com', now() - interval '${ageHours} hours') RETURNING id`), 10);
    sql(`INSERT INTO cart_items (cart_id, product_id, unit_price, quantity) VALUES (${id}, ${productId}, 1999, 1)`);
    return id;
  }

  test('cron abandons an old cart with items + mints a recovery token', async ({ clientApi, request }) => {
    siteId = await resolveClientSiteId(clientApi);
    productId = parseInt(sql(`SELECT id FROM products LIMIT 1`), 10);
    oldCartId = seedCart(2); // 2h old → abandoned
    recentCartId = seedCart(0); // fresh → left alone

    const tick = await request.get('/api/cron/process-cart-abandonment', { headers: { 'x-vercel-cron': '1' } });
    expect(tick.status()).toBe(200);

    expect(sql(`SELECT status FROM carts WHERE id=${oldCartId}`)).toBe('abandoned');
    expect(sql(`SELECT recovery_token IS NOT NULL FROM carts WHERE id=${oldCartId}`)).toBe('t');
    expect(sql(`SELECT status FROM carts WHERE id=${recentCartId}`)).toBe('active');
  });

  test('the recover route reactivates an abandoned cart', async ({ request }) => {
    const token = sql(`SELECT recovery_token FROM carts WHERE id=${oldCartId}`);
    const res = await request.get(`/api/storefront/${siteId}/cart/recover?token=${token}`, { maxRedirects: 0 });
    expect([200, 302, 307]).toContain(res.status());
    expect(sql(`SELECT status FROM carts WHERE id=${oldCartId}`)).toBe('active');
    expect(sql(`SELECT recovery_token IS NULL FROM carts WHERE id=${oldCartId}`)).toBe('t');
  });

  test('cron requires auth', async ({ request }) => {
    expect((await request.get('/api/cron/process-cart-abandonment')).status()).toBe(401);
  });
});

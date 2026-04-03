/**
 * Email Block Editor E2E Tests
 *
 * Tests for the visual block editor integration with email campaigns and templates.
 * Covers API endpoints for blockContent, render-preview, and template management.
 *
 * Requires: The test client must have an active 'email' service subscription.
 * This is set up automatically in beforeAll via direct DB seeding.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

// -- Shared test data --

const SAMPLE_BLOCKS = [
  {
    id: 'block-header-1',
    type: 'email-header',
    order: 0,
    logoUrl: 'https://example.com/logo.png',
    logoWidth: 150,
    tagline: 'Your trusted partner',
    alignment: 'center',
  },
  {
    id: 'block-heading-1',
    type: 'heading',
    order: 1,
    content: 'Welcome to our newsletter',
    level: 1,
    alignment: 'center',
  },
  {
    id: 'block-text-1',
    type: 'text',
    order: 2,
    content: 'Thank you for subscribing to our email list.',
    alignment: 'left',
    size: 'base',
  },
  {
    id: 'block-button-1',
    type: 'button',
    order: 3,
    text: 'Learn More',
    url: 'https://example.com',
    variant: 'primary',
    size: 'md',
    alignment: 'center',
  },
  {
    id: 'block-footer-1',
    type: 'email-footer',
    order: 4,
    companyName: 'Test Corp',
    address: '123 Main St, City, ST 12345',
    showUnsubscribe: true,
  },
];

const BLOCK_CONTENT = { blocks: SAMPLE_BLOCKS, version: '1' };

// -- Setup: ensure the test client has 'email' service access --
// Uses a fixed service name so repeated runs don't create duplicates.

const E2E_EMAIL_SERVICE_NAME = '__e2e_email_service__';
let _emailServiceEnsured = false;

async function ensureEmailService(adminApi: import('./setup/api-client').ApiClient, clientApi: import('./setup/api-client').ApiClient) {
  // Only run once per test process
  if (_emailServiceEnsured) return;

  // Check if we can already access email
  const check = await clientApi.get('/api/portal/email/lists');
  if (check.status === 200) { _emailServiceEnsured = true; return; }

  // Check if our E2E service already exists
  const allSvcs = await adminApi.get('/api/admin/portal/services');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let emailSvc = allSvcs.data?.data?.find((s: any) => s.name === E2E_EMAIL_SERVICE_NAME);

  if (!emailSvc) {
    // Create it once
    const svcRes = await adminApi.post('/api/admin/portal/services', {
      name: E2E_EMAIL_SERVICE_NAME,
      category: 'email',
      price: 0,
      billingCycle: 'monthly',
      active: true,
      features: [],
    });
    if (!svcRes.data?.success) throw new Error(`Failed to create email service: ${svcRes.data?.message}`);
    emailSvc = svcRes.data.data;
  }

  // Get client ID
  const clientsRes = await adminApi.get('/api/admin/portal/clients');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const testClient = clientsRes.data?.data?.find((c: any) => c.userEmail === 'client@example.com');
  const clientId = testClient?.id;
  if (!clientId) throw new Error('Could not determine client ID from admin clients list');

  // Assign service to client (ignore if already assigned)
  await adminApi.post('/api/admin/portal/subscriptions', { clientId, serviceId: emailSvc.id });

  _emailServiceEnsured = true;
}

// ============================================================================
// Campaign API — blockContent support
// ============================================================================

test.describe('Email Block Editor — Campaign API @email @block-editor', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ }, testInfo) => {
    // Grant email service access to the test client
    const { ApiClient } = await import('./setup/api-client');
    const adminApi = new ApiClient('admin@example.com', 'admin123');
    const clientApi = new ApiClient('client@example.com', 'client123');
    await adminApi.ensure();
    await clientApi.ensure();
    const cleanup = await ensureEmailService(adminApi, clientApi);
    await adminApi.dispose();
    await clientApi.dispose();
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /email/campaigns creates campaign with blockContent', async ({ clientApi }) => {
    const { listId, cleanup: listCleanup } = await createTestList(clientApi);
    cleanups.push(listCleanup);

    const name = `Block Campaign ${Date.now()}`;
    const res = await clientApi.post('/api/portal/email/campaigns', {
      name,
      subject: 'Visual Editor Test',
      fromName: 'Test Sender',
      fromEmail: 'test@example.com',
      listId,
      blockContent: BLOCK_CONTENT,
    });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);
    expect(res.data.data.status).toBe('draft');

    const campaignId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/campaigns/${campaignId}`).catch(() => {});
    });
  });

  test('POST /email/campaigns with blockContent auto-generates htmlContent', async ({ clientApi }) => {
    const { listId, cleanup: listCleanup } = await createTestList(clientApi);
    cleanups.push(listCleanup);

    const res = await clientApi.post('/api/portal/email/campaigns', {
      name: `Auto HTML ${Date.now()}`,
      subject: 'Auto HTML Test',
      fromName: 'Sender',
      fromEmail: 'test@example.com',
      listId,
      blockContent: BLOCK_CONTENT,
    });

    expect(res.status).toBe(201);

    // Verify the campaign was saved — fetch it back
    const campaignId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/campaigns/${campaignId}`).catch(() => {});
    });

    const getRes = await clientApi.get(`/api/portal/email/campaigns/${campaignId}`);
    expect(getRes.status).toBe(200);
    const campaign = getRes.data.data.campaign;

    // htmlContent should have been rendered from blocks
    expect(campaign.htmlContent).toBeTruthy();
    expect(campaign.htmlContent.length).toBeGreaterThan(0);
    // Should contain rendered heading text
    expect(campaign.htmlContent).toContain('Welcome to our newsletter');
    // Should contain button text
    expect(campaign.htmlContent).toContain('Learn More');
  });

  test('GET /email/campaigns/:id returns blockContent', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestBlockCampaign(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/email/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.campaign.blockContent).toBeTruthy();
    expect(res.data.data.campaign.blockContent.blocks).toHaveLength(SAMPLE_BLOCKS.length);
    expect(res.data.data.campaign.blockContent.blocks[0].type).toBe('email-header');
  });

  test('PATCH /email/campaigns/:id updates blockContent', async ({ clientApi }) => {
    const { campaignId, cleanup } = await createTestBlockCampaign(clientApi);
    cleanups.push(cleanup);

    const updatedBlocks = [
      { id: 'block-1', type: 'heading', order: 0, content: 'Updated Heading', level: 2, alignment: 'center' },
      { id: 'block-2', type: 'text', order: 1, content: 'Updated body text.', alignment: 'left', size: 'base' },
    ];

    const res = await clientApi.patch(`/api/portal/email/campaigns/${campaignId}`, {
      blockContent: { blocks: updatedBlocks, version: '1' },
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify the update persisted
    const getRes = await clientApi.get(`/api/portal/email/campaigns/${campaignId}`);
    const campaign = getRes.data.data.campaign;
    expect(campaign.blockContent.blocks).toHaveLength(2);
    expect(campaign.htmlContent).toContain('Updated Heading');
    expect(campaign.htmlContent).toContain('Updated body text');
  });

  test('POST /email/campaigns still works with raw htmlContent (backward compat)', async ({ clientApi }) => {
    const { listId, cleanup: listCleanup } = await createTestList(clientApi);
    cleanups.push(listCleanup);

    const res = await clientApi.post('/api/portal/email/campaigns', {
      name: `Raw HTML Campaign ${Date.now()}`,
      subject: 'Raw HTML Test',
      fromName: 'Sender',
      fromEmail: 'test@example.com',
      listId,
      htmlContent: '<h1>Legacy</h1><p>Raw HTML campaign</p>',
    });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);

    const campaignId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/campaigns/${campaignId}`).catch(() => {});
    });

    // blockContent should be null for raw HTML campaigns
    const getRes = await clientApi.get(`/api/portal/email/campaigns/${campaignId}`);
    expect(getRes.data.data.campaign.blockContent).toBeNull();
    expect(getRes.data.data.campaign.htmlContent).toContain('Legacy');
  });

  test('POST /email/campaigns rejects missing content (no blockContent or htmlContent)', async ({ clientApi }) => {
    const { listId, cleanup: listCleanup } = await createTestList(clientApi);
    cleanups.push(listCleanup);

    const res = await clientApi.post('/api/portal/email/campaigns', {
      name: `No Content ${Date.now()}`,
      subject: 'No Content Test',
      fromName: 'Sender',
      fromEmail: 'test@example.com',
      listId,
    });

    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

// ============================================================================
// Render Preview API
// ============================================================================

test.describe('Email Block Editor — Render Preview API @email @block-editor @preview', () => {
  test.beforeAll(async () => {
    const { ApiClient } = await import('./setup/api-client');
    const adminApi = new ApiClient('admin@example.com', 'admin123');
    const clientApi = new ApiClient('client@example.com', 'client123');
    await adminApi.ensure(); await clientApi.ensure();
    await ensureEmailService(adminApi, clientApi);
    await adminApi.dispose(); await clientApi.dispose();
  });

  test('POST /email/render-preview renders blocks to email HTML', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: BLOCK_CONTENT,
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.html).toBeTruthy();

    const html = res.data.data.html;
    // Should be a full HTML document
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    // Should contain rendered block content
    expect(html).toContain('Welcome to our newsletter');
    expect(html).toContain('Learn More');
    expect(html).toContain('Test Corp');
    // Should have unsubscribe placeholder rendered
    expect(html).toContain('Unsubscribe');
    // Should have table-based layout (email-safe)
    expect(html).toContain('role="presentation"');
    // Should have max-width 600px email wrapper
    expect(html).toContain('max-width:600px');
  });

  test('POST /email/render-preview renders heading block with correct tag', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        blocks: [
          { id: 'h1', type: 'heading', order: 0, content: 'H1 Title', level: 1, alignment: 'center' },
          { id: 'h3', type: 'heading', order: 1, content: 'H3 Subtitle', level: 3, alignment: 'left' },
        ],
        version: '1',
      },
    });

    expect(res.status).toBe(200);
    expect(res.data.data.html).toContain('<h1');
    expect(res.data.data.html).toContain('H1 Title');
    expect(res.data.data.html).toContain('<h3');
    expect(res.data.data.html).toContain('H3 Subtitle');
  });

  test('POST /email/render-preview renders button as table-based element', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        blocks: [
          { id: 'btn1', type: 'button', order: 0, text: 'Click Me', url: 'https://example.com', variant: 'primary', size: 'md', alignment: 'center' },
        ],
        version: '1',
      },
    });

    expect(res.status).toBe(200);
    const html = res.data.data.html;
    // Button should be table-based for email client compatibility
    expect(html).toContain('role="presentation"');
    expect(html).toContain('Click Me');
    expect(html).toContain('href="https://example.com"');
  });

  test('POST /email/render-preview renders spacer and divider', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        blocks: [
          { id: 'sp1', type: 'spacer', order: 0, height: 'lg' },
          { id: 'dv1', type: 'divider', order: 1, lineStyle: 'dashed' },
        ],
        version: '1',
      },
    });

    expect(res.status).toBe(200);
    const html = res.data.data.html;
    expect(html).toContain('48px'); // lg spacer height
    expect(html).toContain('dashed'); // divider style
  });

  test('POST /email/render-preview renders social links', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        blocks: [{
          id: 'social1',
          type: 'social-links',
          order: 0,
          links: [
            { platform: 'twitter', url: 'https://twitter.com/test' },
            { platform: 'linkedin', url: 'https://linkedin.com/in/test' },
          ],
          alignment: 'center',
        }],
        version: '1',
      },
    });

    expect(res.status).toBe(200);
    const html = res.data.data.html;
    expect(html).toContain('X (Twitter)');
    expect(html).toContain('LinkedIn');
    expect(html).toContain('https://twitter.com/test');
  });

  test('POST /email/render-preview renders email footer with unsubscribe', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        blocks: [{
          id: 'footer1',
          type: 'email-footer',
          order: 0,
          companyName: 'Acme Inc',
          address: '456 Oak Ave',
          showUnsubscribe: true,
        }],
        version: '1',
      },
    });

    expect(res.status).toBe(200);
    const html = res.data.data.html;
    expect(html).toContain('Acme Inc');
    expect(html).toContain('456 Oak Ave');
    expect(html).toContain('{{UNSUBSCRIBE_URL}}');
  });

  test('POST /email/render-preview with empty blocks returns minimal HTML', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: { blocks: [], version: '1' },
    });

    expect(res.status).toBe(200);
    expect(res.data.data.html).toContain('<!DOCTYPE html>');
  });

  test('POST /email/render-preview rejects missing blockContent', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /email/render-preview rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/email/render-preview', {
      blockContent: BLOCK_CONTENT,
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Template API — blockContent support
// ============================================================================

test.describe('Email Block Editor — Template API @email @block-editor @templates', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async () => {
    const { ApiClient } = await import('./setup/api-client');
    const adminApi = new ApiClient('admin@example.com', 'admin123');
    const clientApi = new ApiClient('client@example.com', 'client123');
    await adminApi.ensure(); await clientApi.ensure();
    await ensureEmailService(adminApi, clientApi);
    await adminApi.dispose(); await clientApi.dispose();
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /email/templates creates template with blockContent', async ({ clientApi }) => {
    const name = `Block Template ${Date.now()}`;
    const res = await clientApi.post('/api/portal/email/templates', {
      name,
      description: 'Template with visual blocks',
      category: 'newsletter',
      subject: 'Newsletter Template',
      blockContent: BLOCK_CONTENT,
    });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.name).toBe(name);

    const templateId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/templates/${templateId}`).catch(() => {});
    });

    // htmlContent should have been auto-rendered from blocks
    expect(res.data.data.htmlContent).toBeTruthy();
    expect(res.data.data.htmlContent).toContain('Welcome to our newsletter');
  });

  test('POST /email/templates still works with raw htmlContent', async ({ clientApi }) => {
    const name = `HTML Template ${Date.now()}`;
    const res = await clientApi.post('/api/portal/email/templates', {
      name,
      category: 'custom',
      htmlContent: '<h1>Raw Template</h1>',
    });

    expect(res.status).toBe(201);
    expect(res.data.data.htmlContent).toContain('Raw Template');

    const templateId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/email/templates/${templateId}`).catch(() => {});
    });
  });

  test('PATCH /email/templates/:id updates blockContent and re-renders HTML', async ({ clientApi }) => {
    const { templateId, cleanup } = await createTestBlockTemplate(clientApi);
    cleanups.push(cleanup);

    const newBlocks = [
      { id: 'new-1', type: 'heading', order: 0, content: 'Revised Template', level: 1, alignment: 'center' },
    ];

    const res = await clientApi.patch(`/api/portal/email/templates/${templateId}`, {
      blockContent: { blocks: newBlocks, version: '1' },
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.htmlContent).toContain('Revised Template');
  });

  test('GET /email/templates returns templates with blockContent', async ({ clientApi }) => {
    const { templateId, cleanup } = await createTestBlockTemplate(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/email/templates');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const found = res.data.data.find((t: { id: number }) => t.id === templateId);
    expect(found).toBeTruthy();
    expect(found.blockContent).toBeTruthy();
    expect(found.blockContent.blocks.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Columns and Section block rendering
// ============================================================================

test.describe('Email Block Editor — Complex Blocks @email @block-editor @rendering', () => {
  test.beforeAll(async () => {
    const { ApiClient } = await import('./setup/api-client');
    const adminApi = new ApiClient('admin@example.com', 'admin123');
    const clientApi = new ApiClient('client@example.com', 'client123');
    await adminApi.ensure(); await clientApi.ensure();
    await ensureEmailService(adminApi, clientApi);
    await adminApi.dispose(); await clientApi.dispose();
  });

  test('renders columns block with Outlook conditionals', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        blocks: [{
          id: 'cols1',
          type: 'columns',
          order: 0,
          columns: [
            { id: 'col-a', width: 50, blocks: [{ id: 'inner-1', type: 'text', order: 0, content: 'Left column', alignment: 'left', size: 'base' }] },
            { id: 'col-b', width: 50, blocks: [{ id: 'inner-2', type: 'text', order: 0, content: 'Right column', alignment: 'left', size: 'base' }] },
          ],
          gap: 'md',
        }],
        version: '1',
      },
    });

    expect(res.status).toBe(200);
    const html = res.data.data.html;
    expect(html).toContain('Left column');
    expect(html).toContain('Right column');
    // Outlook conditional comments
    expect(html).toContain('<!--[if mso]>');
    expect(html).toContain('<![endif]-->');
  });

  test('renders section block with background', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        blocks: [{
          id: 'sec1',
          type: 'section',
          order: 0,
          blocks: [
            { id: 'sec-inner', type: 'heading', order: 0, content: 'Section Heading', level: 2, alignment: 'center' },
          ],
          backgroundColor: '#f0f9ff',
          paddingTop: '32px',
          paddingBottom: '32px',
        }],
        version: '1',
      },
    });

    expect(res.status).toBe(200);
    const html = res.data.data.html;
    expect(html).toContain('Section Heading');
    expect(html).toContain('#f0f9ff');
    expect(html).toContain('role="presentation"');
  });

  test('renders quote block with border', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        blocks: [{
          id: 'q1',
          type: 'quote',
          order: 0,
          content: 'A great quote',
          author: 'John Doe',
        }],
        version: '1',
      },
    });

    expect(res.status).toBe(200);
    const html = res.data.data.html;
    expect(html).toContain('A great quote');
    expect(html).toContain('John Doe');
    expect(html).toContain('font-style:italic');
  });

  test('renders image block with width attributes', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/render-preview', {
      blockContent: {
        blocks: [{
          id: 'img1',
          type: 'image',
          order: 0,
          url: 'https://example.com/photo.jpg',
          alt: 'Test image',
          width: 'medium',
          alignment: 'center',
          caption: 'Photo caption',
        }],
        version: '1',
      },
    });

    expect(res.status).toBe(200);
    const html = res.data.data.html;
    expect(html).toContain('https://example.com/photo.jpg');
    expect(html).toContain('alt="Test image"');
    expect(html).toContain('Photo caption');
    expect(html).toContain('400px'); // medium width
  });
});

// ============================================================================
// Auth tests
// ============================================================================

test.describe('Email Block Editor — Auth @email @block-editor @auth', () => {
  test('all email endpoints reject unauthenticated requests', async ({ unauthApi }) => {
    const endpoints = [
      () => unauthApi.get('/api/portal/email/campaigns'),
      () => unauthApi.post('/api/portal/email/campaigns', {}),
      () => unauthApi.get('/api/portal/email/templates'),
      () => unauthApi.post('/api/portal/email/templates', {}),
      () => unauthApi.post('/api/portal/email/render-preview', {}),
    ];

    for (const call of endpoints) {
      const res = await call();
      expect(res.status).toBe(401);
    }
  });
});

// ============================================================================
// Helpers
// ============================================================================

async function createTestList(api: import('./setup/api-client').ApiClient) {
  const name = `Test List ${Date.now()}`;
  const res = await api.post('/api/portal/email/lists', {
    name,
    description: 'E2E test list for block editor',
  });
  if (!res.data?.success) throw new Error(`Failed to create test list: ${res.data?.message}`);
  const listId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/email/lists/${listId}`).catch(() => {});
  };
  return { listId, cleanup };
}

async function createTestBlockCampaign(api: import('./setup/api-client').ApiClient) {
  const { listId, cleanup: listCleanup } = await createTestList(api);
  const name = `Block Campaign ${Date.now()}`;
  const res = await api.post('/api/portal/email/campaigns', {
    name,
    subject: 'Block Editor Test',
    fromName: 'Test Sender',
    fromEmail: 'test@example.com',
    listId,
    blockContent: BLOCK_CONTENT,
  });
  if (!res.data?.success) throw new Error(`Failed to create test block campaign: ${res.data?.message}`);
  const campaignId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/email/campaigns/${campaignId}`).catch(() => {});
    await listCleanup();
  };
  return { campaignId, listId, cleanup };
}

async function createTestBlockTemplate(api: import('./setup/api-client').ApiClient) {
  const name = `Block Template ${Date.now()}`;
  const res = await api.post('/api/portal/email/templates', {
    name,
    description: 'E2E test block template',
    category: 'newsletter',
    subject: 'Test Template Subject',
    blockContent: BLOCK_CONTENT,
  });
  if (!res.data?.success) throw new Error(`Failed to create test block template: ${res.data?.message}`);
  const templateId = res.data.data.id;
  const cleanup = async () => {
    await api.delete(`/api/portal/email/templates/${templateId}`).catch(() => {});
  };
  return { templateId, cleanup };
}

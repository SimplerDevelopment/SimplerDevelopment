import { test as base } from '@playwright/test';
import { ApiClient } from './api-client';

// Seed credentials (from scripts/seed-admin.ts and seed-portal-client.ts)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const CLIENT_EMAIL = 'client@example.com';
const CLIENT_PASSWORD = 'client123';

type Fixtures = {
  clientApi: ApiClient;
  adminApi: ApiClient;
  unauthApi: ApiClient;
};

export const test = base.extend<Fixtures>({
  clientApi: async ({}, use) => {
    const api = new ApiClient(CLIENT_EMAIL, CLIENT_PASSWORD);
    await api.ensure();
    await use(api);
    await api.dispose();
  },
  adminApi: async ({}, use) => {
    const api = new ApiClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    await api.ensure();
    await use(api);
    await api.dispose();
  },
  unauthApi: async ({}, use) => {
    const api = new ApiClient(); // no credentials
    await api.ensure();
    await use(api);
    await api.dispose();
  },
});

export { expect } from '@playwright/test';

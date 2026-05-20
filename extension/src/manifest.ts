import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'SimplerDevelopment Brain',
  version: '0.1.0',
  description:
    'Capture pages to your Company Brain. Add CRM records and search from any tab.',
  action: {
    default_title: 'SD Brain',
    default_popup: 'src/popup/index.html',
  },
  options_page: 'src/options/index.html',
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: [
    'activeTab',
    'scripting',
    'storage',
    'contextMenus',
    'sidePanel',
    'notifications',
    'tabs',
  ],
  host_permissions: ['<all_urls>'],
  commands: {
    'open-quick-capture': {
      suggested_key: {
        default: 'Ctrl+Shift+B',
        mac: 'Command+Shift+B',
      },
      description: 'Quick capture current page to Brain',
    },
  },
  icons: {
    16: 'public/icon-16.png',
    32: 'public/icon-32.png',
    48: 'public/icon-48.png',
    128: 'public/icon-128.png',
  },
});

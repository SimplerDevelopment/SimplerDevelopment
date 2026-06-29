// Content Tools — handler bundle.
//
// Importing this file (via side effect) registers every content-tools
// callback handler with `lib/plugins/handlers/registry.ts`. The dispatcher
// at `app/api/plugin-callback/[appId]/[...path]/route.ts` does this import
// at module load so the registry is hot before the first inbound request.

import { registerAppHandlers } from '../registry';
import { scriptsHandlers } from './scripts';
import { jobsHandlers } from './jobs';
import { briefsHandlers } from './briefs';
import { draftsHandlers } from './drafts';
import { completeHandlers } from './complete';
import { brainHandlers } from './brain';

export const CONTENT_TOOLS_SLUG = 'content-tools' as const;

registerAppHandlers(CONTENT_TOOLS_SLUG, [
  ...scriptsHandlers,
  ...jobsHandlers,
  ...briefsHandlers,
  ...draftsHandlers,
  ...completeHandlers,
  ...brainHandlers,
]);

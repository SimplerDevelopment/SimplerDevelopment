/**
 * Barrel for the per-domain MCP tool registrars.
 *
 * Each register*Tools function takes the McpServer instance plus the portal
 * context and registers every tool that belongs to its domain. The
 * dispatcher in lib/mcp/server.ts iterates `allToolRegistrars` to compose
 * the full registry — adding a domain is now a one-line change here, not a
 * new branch in the monolith.
 */
import type { McpToolRegistrar } from '../types';

import { registerProjectsTools } from './projects';
import { registerKanbanTools } from './kanban';
import { registerSprintsTools } from './sprints';
import { registerTicketsTools } from './tickets';
import { registerCrmTools } from './crm';
import { registerCmsTools } from './cms';
import { registerEmailTools } from './email';
import { registerPitchDecksTools } from './pitch-decks';
import { registerSurveysTools } from './surveys';
import { registerBookingsTools } from './bookings';
import { registerTeamTools } from './team';
import { registerProfileTools } from './profile';
import { registerIntegrationsTools } from './integrations';
import { registerBillingTools } from './billing';
import { registerServicesTools } from './services';
import { registerAiTools } from './ai';
import { registerAutomationsTools } from './automations';
import { registerHostingTools } from './hosting';
import { registerMetaTools } from './meta';
import { registerBrandingTools } from './branding';
import { registerStorefrontTools } from './storefront';
import { registerBrainTools } from './brain';
import { registerPostTypesTools } from './post-types';
import { registerApprovalsTools } from './approvals';

export {
  registerProjectsTools,
  registerKanbanTools,
  registerSprintsTools,
  registerTicketsTools,
  registerCrmTools,
  registerCmsTools,
  registerEmailTools,
  registerPitchDecksTools,
  registerSurveysTools,
  registerBookingsTools,
  registerTeamTools,
  registerProfileTools,
  registerIntegrationsTools,
  registerBillingTools,
  registerServicesTools,
  registerAiTools,
  registerAutomationsTools,
  registerHostingTools,
  registerMetaTools,
  registerBrandingTools,
  registerStorefrontTools,
  registerBrainTools,
  registerPostTypesTools,
  registerApprovalsTools,
};

/**
 * Ordered list of every domain registrar. Order is intentional — `meta` runs
 * first so the unscoped resources/`whoami` tool register before any domain
 * gate. The remaining order matches the original section order in
 * lib/mcp/server.ts so behaviour is identical to the pre-refactor monolith.
 */
export const allToolRegistrars: readonly McpToolRegistrar[] = [
  registerMetaTools,
  registerProjectsTools,
  registerKanbanTools,
  registerTicketsTools,
  registerCrmTools,
  registerCmsTools,
  registerEmailTools,
  registerPitchDecksTools,
  registerSurveysTools,
  registerBookingsTools,
  registerSprintsTools,
  registerProfileTools,
  registerIntegrationsTools,
  registerBillingTools,
  registerServicesTools,
  registerAiTools,
  registerAutomationsTools,
  registerHostingTools,
  registerTeamTools,
  registerBrandingTools,
  registerStorefrontTools,
  registerBrainTools,
  registerPostTypesTools,
  registerApprovalsTools,
];

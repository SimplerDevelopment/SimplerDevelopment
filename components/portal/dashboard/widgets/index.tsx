import type { ComponentType } from 'react';
import type { DashboardWidgetId } from '@/lib/dashboard/widgets';

import WebsitesGlanceWidget from './WebsitesGlanceWidget';
import EditorialPipelineWidget from './EditorialPipelineWidget';
import StoreOverviewWidget from './StoreOverviewWidget';
import EmailPerformanceWidget from './EmailPerformanceWidget';
import CrmSnapshotWidget from './CrmSnapshotWidget';
import CrmActivityWidget from './CrmActivityWidget';
import ProposalsEsignWidget from './ProposalsEsignWidget';
import UpcomingBookingsWidget from './UpcomingBookingsWidget';
import SurveyResponsesWidget from './SurveyResponsesWidget';
import AbExperimentsWidget from './AbExperimentsWidget';
import ProjectsOverviewWidget from './ProjectsOverviewWidget';
import MyTasksWidget from './MyTasksWidget';
import SupportTicketsWidget from './SupportTicketsWidget';
import InvoicesWidget from './InvoicesWidget';
import BrainReviewQueueWidget from './BrainReviewQueueWidget';
import BrainTasksWidget from './BrainTasksWidget';
import LiveChatWidget from './LiveChatWidget';
import AutomationsWidget from './AutomationsWidget';
import PitchDecksWidget from './PitchDecksWidget';
import AgencyStatusWidget from './AgencyStatusWidget';
import HostingStatusWidget from './HostingStatusWidget';
import AiConnectWidget from './AiConnectWidget';

export const WIDGET_COMPONENTS: Record<
  DashboardWidgetId,
  ComponentType<{ clientId: number; userId: number }>
> = {
  'websites-glance': WebsitesGlanceWidget,
  'editorial-pipeline': EditorialPipelineWidget,
  'store-overview': StoreOverviewWidget,
  'email-performance': EmailPerformanceWidget,
  'crm-snapshot': CrmSnapshotWidget,
  'crm-activity': CrmActivityWidget,
  'proposals-esign': ProposalsEsignWidget,
  'upcoming-bookings': UpcomingBookingsWidget,
  'survey-responses': SurveyResponsesWidget,
  'ab-experiments': AbExperimentsWidget,
  'projects-overview': ProjectsOverviewWidget,
  'my-tasks': MyTasksWidget,
  'support-tickets': SupportTicketsWidget,
  invoices: InvoicesWidget,
  'brain-review-queue': BrainReviewQueueWidget,
  'brain-tasks': BrainTasksWidget,
  'live-chat': LiveChatWidget,
  automations: AutomationsWidget,
  'pitch-decks': PitchDecksWidget,
  'agency-status': AgencyStatusWidget,
  'hosting-status': HostingStatusWidget,
  'ai-connect': AiConnectWidget,
};

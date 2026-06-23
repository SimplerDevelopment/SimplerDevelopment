'use client';

import Link from 'next/link';
import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

const PROJECT_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'project_created_notify',
    name: 'New Project Notification',
    description: 'Get notified when a new project is created so you can set it up properly',
    icon: 'notifications_active',
    trigger: { event: 'project.created' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'New project created: {{event.name}}', body: 'A new project "{{event.name}}" has been created. Set up the board, assign team members, and define the first sprint.' } }],
  },
  {
    key: 'task_completed_notify',
    name: 'Task Completed Alert',
    description: 'Get alerted when a task is moved to the done column',
    icon: 'task_alt',
    trigger: { event: 'task.completed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Task completed: {{event.title}}', body: 'Task "{{event.title}}" has been marked as completed. Review if there are any follow-up items needed.' } }],
  },
  {
    key: 'task_assigned_notify',
    name: 'Task Assignment Notification',
    description: 'Notify team members when a task is assigned to them',
    icon: 'assignment_ind',
    trigger: { event: 'task.assigned' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Task assigned: {{event.title}}', body: 'You have been assigned the task "{{event.title}}". Check the project board for details and priority.' } }],
  },
  {
    key: 'project_status_change',
    name: 'Project Status Change Alert',
    description: 'Get notified when a project status changes (active, paused, completed)',
    icon: 'swap_horiz',
    trigger: { event: 'project.status.changed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Project status changed: {{event.name}}', body: 'Project "{{event.name}}" status has changed to {{event.status}}. Review and update team accordingly.' } }],
  },
  {
    key: 'task_created_crm',
    name: 'Log Task in CRM',
    description: 'Create a CRM activity when a project task is created for client-facing work',
    icon: 'contacts',
    trigger: { event: 'task.created' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Project task for CRM tracking: {{event.title}}', body: 'A new task "{{event.title}}" was created. Consider logging this as a CRM activity if it involves client work.' } }],
  },
];

export default function ProjectAutomationsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/portal/projects" className="hover:text-foreground transition-colors">Projects</Link>
        <span className="material-icons text-xs">chevron_right</span>
        <span className="text-foreground">Automations</span>
      </div>

      <ProductAutomationSettings
        productScope="projects"
        presets={PROJECT_AUTOMATION_PRESETS}
        title="Project Automations"
        description="Automate notifications and workflows for your projects and tasks"
      />
    </div>
  );
}

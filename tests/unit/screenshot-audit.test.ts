import { describe, it, expect } from 'vitest';
import { auditText } from '@/lib/screenshots/audit';

/**
 * Fixtures are real strings lifted from the 2026-08-07 audit of the 64 live
 * /solutions gallery screenshots. Each one shipped to production.
 */
describe('screenshot audit — rejects what actually shipped', () => {
  const cases: [string, string, string][] = [
    ['hosting/01', 'Hosting\nNo hosted sites yet\nWhen Simpler Development provisions a hosting environment', 'empty-state'],
    ['company-brain/07', 'Playbooks\nNo playbooks yet.\nDefine your first repeatable process', 'empty-state'],
    ['company-brain/03', 'People\nNo people on file yet.\nAdd the first member of your team.', 'empty-state'],
    ['pm/03-my-tasks', 'My Tasks\n0 tasks assigned to you\nNothing assigned\nYou have no open tasks.', 'empty-state'],
    ['agency/01', 'Custom Portal Domain\nNo custom domain configured\nAgency Branding\nNot configured', 'unconfigured'],
    ['ai-chatbot/01', 'Inbox\nNo chat widgets yet. Create one and embed it on a site.', 'empty-state'],
    ['publishing/03', 'Campaigns\nNo campaigns yet\nAsk an owner or admin to create a campaign.', 'empty-state'],
    ['pm/01-projects', 'Projects\n[archived-e2e] E2E PM Project 1782603867391', 'e2e-fixture'],
    ['publishing/01-board', 'Idea 5\nE2E condition branch task 1782603867391', 'e2e-fixture'],
    ['experiments/02', 'A/B test — fixture\nPage: AB Post 1782611532566', 'e2e-fixture'],
    ['email/04-analytics', 'Subscriber Lists\nTest List 1782583209258\n0 active / 1 total', 'test-fixture'],
    ['ai-connect/02', 'Create post "APPR-MUT-BulkR2-1782583475227" on website 22', 'e2e-fixture'],
    ['invoicing/02', 'INV-PAY-E2E-Consulting-1780512187667', 'e2e-fixture'],
    ['ai-chatbot/02-widgets', 'Embed\n<script src="http://localhost:3100/widget/chat.js" async></script>', 'localhost URL'],
    ['company-brain/09-ask', 'MCP endpoint\nhttp://localhost:3100/api/mcp', 'localhost URL'],
    ['contracts/03', 'Discovery & Architecture $5,000.00 $NaN\nSubtotal $NaN\nTotal $NaN', 'NaN in rendered output'],
    ['ecommerce/01', 'Cold Brew Concentrate\nactive\n$NaN\n999', 'NaN in rendered output'],

  ];

  for (const [name, text, expectedKind] of cases) {
    it(`rejects ${name} (${expectedKind})`, () => {
      const violations = auditText(text);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.map((v) => v.kind)).toContain(expectedKind);
    });
  }
});

describe('screenshot audit — passes what is genuinely good', () => {
  const good: [string, string][] = [
    [
      'pm/02-project-board',
      'Website Redesign\nFull redesign of the Acme corporate website — new homepage hero, rebuilt checkout, CMS migration.\nBacklog 4 Audit current site performance medium\nIn Progress 3 Design new homepage hero high',
    ],
    [
      'websites/01',
      'Websites\nNorthwind Coffee Co. Live northwindcoffee.simplerdevelopment.com\nArtisan coffee roastery serving the Pacific Northwest since 2018.\n1 page',
    ],
    [
      'surveys/03-live-survey',
      'Customer Satisfaction Survey\nHow satisfied are you with Northwind Coffee Co.?\nHow likely are you to recommend Northwind Coffee Co. to a friend?\nSubmit',
    ],
    [
      'crm/03-deals-board',
      'Deals\nQualified 1 $15,000.00 TechVentures Platform Build high Alice Chen\nProposal 1 $22,000.00 TechVentures API Integration high Bob Martinez',
    ],
  ];

  for (const [name, text] of good) {
    it(`accepts ${name}`, () => {
      expect(auditText(text)).toEqual([]);
    });
  }

  it('does not flag ordinary marketing copy containing "no"', () => {
    expect(auditText('No credit card required. Cancel anytime.')).toEqual([]);
  });

  it('allowEmpty exempts a legitimately blank setup form', () => {
    const domainForm = 'Custom Portal Domain\nDomain\nNot configured\nWe will generate a TXT record.';
    expect(auditText(domainForm).length).toBeGreaterThan(0);
    expect(auditText(domainForm, { allowEmpty: true })).toEqual([]);
  });
});

import type { SurveyFieldDef } from '@/lib/db/schema';

export interface SurveyTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  fields: SurveyFieldDef[];
  requireEmail: boolean;
}

let order = 0;
function f(partial: Partial<SurveyFieldDef> & { type: SurveyFieldDef['type']; label: string }): SurveyFieldDef {
  return {
    id: `t${order}`,
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    order: order++,
    page: 0,
    ...partial,
  };
}

function resetOrder() { order = 0; }

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  (() => {
    resetOrder();
    return {
      id: 'nps',
      name: 'Net Promoter Score (NPS)',
      description: 'Measure customer loyalty with the standard NPS question and follow-up',
      icon: 'speed',
      category: 'Feedback',
      requireEmail: true,
      fields: [
        f({ type: 'slider', label: 'How likely are you to recommend us to a friend or colleague?', required: true, min: 0, max: 10, step: 1, helpText: '0 = Not at all likely, 10 = Extremely likely' }),
        f({ type: 'textarea', label: 'What is the primary reason for your score?', required: true, placeholder: 'Tell us what drove your rating...' }),
        f({ type: 'textarea', label: 'What could we do to improve your experience?', placeholder: 'Any suggestions are welcome' }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'csat',
      name: 'Customer Satisfaction (CSAT)',
      description: 'Quick satisfaction survey after a service interaction or purchase',
      icon: 'sentiment_satisfied',
      category: 'Feedback',
      requireEmail: false,
      fields: [
        f({ type: 'rating', label: 'How satisfied are you with your recent experience?', required: true }),
        f({ type: 'radio', label: 'Which area are you rating?', required: true, options: ['Product quality', 'Customer service', 'Delivery/timeliness', 'Value for money', 'Overall experience'] }),
        f({ type: 'textarea', label: 'Tell us more about your experience', placeholder: 'What went well or could be improved?' }),
        f({ type: 'toggle', label: 'Would you use our service again?' }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'customer-feedback',
      name: 'Customer Feedback',
      description: 'Comprehensive feedback form covering multiple aspects of your business',
      icon: 'rate_review',
      category: 'Feedback',
      requireEmail: true,
      fields: [
        f({ type: 'heading', label: 'About Your Experience' }),
        f({ type: 'rating', label: 'Overall satisfaction with our product/service', required: true }),
        f({ type: 'rating', label: 'Quality of customer support' }),
        f({ type: 'rating', label: 'Value for money' }),
        f({ type: 'page_break', label: 'Page Break' }),
        f({ type: 'heading', label: 'Details', page: 1 }),
        f({ type: 'radio', label: 'How often do you use our product/service?', required: true, options: ['Daily', 'Weekly', 'Monthly', 'Rarely'], page: 1 }),
        f({ type: 'checkbox', label: 'Which features do you use most?', options: ['Core product', 'Reporting', 'Integrations', 'Mobile app', 'API'], page: 1 }),
        f({ type: 'textarea', label: 'What feature would you most like to see added?', page: 1 }),
        f({ type: 'page_break', label: 'Page Break' }),
        f({ type: 'heading', label: 'Final Thoughts', page: 2 }),
        f({ type: 'textarea', label: 'Any other feedback or suggestions?', page: 2 }),
        f({ type: 'toggle', label: 'May we contact you about your feedback?', page: 2 }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'event-feedback',
      name: 'Event Feedback',
      description: 'Post-event survey for conferences, workshops, or webinars',
      icon: 'event',
      category: 'Events',
      requireEmail: false,
      fields: [
        f({ type: 'heading', label: 'Event Experience' }),
        f({ type: 'rating', label: 'How would you rate the event overall?', required: true }),
        f({ type: 'radio', label: 'How relevant was the content to you?', required: true, options: ['Very relevant', 'Somewhat relevant', 'Neutral', 'Not very relevant', 'Not at all relevant'] }),
        f({ type: 'rating', label: 'Quality of speakers/presenters' }),
        f({ type: 'rating', label: 'Quality of venue/platform' }),
        f({ type: 'page_break', label: 'Page Break' }),
        f({ type: 'heading', label: 'Specifics', page: 1 }),
        f({ type: 'textarea', label: 'What was the most valuable part of the event?', required: true, page: 1 }),
        f({ type: 'textarea', label: 'What could be improved for next time?', page: 1 }),
        f({ type: 'radio', label: 'Would you attend a future event?', options: ['Definitely', 'Probably', 'Maybe', 'Probably not', 'Definitely not'], page: 1 }),
        f({ type: 'checkbox', label: 'What topics interest you for future events?', options: ['Industry trends', 'Technical deep dives', 'Case studies', 'Networking', 'Hands-on workshops'], page: 1 }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'lead-qualification',
      name: 'Lead Qualification',
      description: 'Qualify inbound leads with budget, timeline, and needs assessment',
      icon: 'filter_alt',
      category: 'Sales',
      requireEmail: true,
      fields: [
        f({ type: 'heading', label: 'About You' }),
        f({ type: 'text', label: 'Company Name', required: true }),
        f({ type: 'text', label: 'Job Title', required: true }),
        f({ type: 'select', label: 'Company Size', required: true, options: ['1-10 employees', '11-50', '51-200', '201-1000', '1000+'] }),
        f({ type: 'page_break', label: 'Page Break' }),
        f({ type: 'heading', label: 'Your Needs', page: 1 }),
        f({ type: 'checkbox', label: 'What are you looking for?', required: true, options: ['New website', 'Website redesign', 'E-commerce', 'SEO/Marketing', 'Custom development', 'Consulting'], page: 1 }),
        f({ type: 'select', label: 'Budget Range', required: true, options: ['Under $5,000', '$5,000 - $15,000', '$15,000 - $50,000', '$50,000 - $100,000', 'Over $100,000'], page: 1 }),
        f({ type: 'radio', label: 'Timeline', required: true, options: ['ASAP', 'Within 1 month', '1-3 months', '3-6 months', 'Just exploring'], page: 1 }),
        f({ type: 'page_break', label: 'Page Break' }),
        f({ type: 'heading', label: 'Details', page: 2 }),
        f({ type: 'textarea', label: 'Describe your project or needs', required: true, placeholder: 'The more detail you provide, the better we can help...', page: 2 }),
        f({ type: 'url', label: 'Current website (if applicable)', placeholder: 'https://...', page: 2 }),
        f({ type: 'radio', label: 'How did you hear about us?', options: ['Google search', 'Referral', 'Social media', 'Event/conference', 'Other'], page: 2 }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'post-meeting',
      name: 'Post-Meeting Feedback',
      description: 'Follow-up survey after consultations or client meetings',
      icon: 'groups',
      category: 'Meetings',
      requireEmail: false,
      fields: [
        f({ type: 'rating', label: 'How helpful was the meeting?', required: true }),
        f({ type: 'radio', label: 'Did the meeting cover everything you needed?', required: true, options: ['Yes, completely', 'Mostly', 'Partially', 'Not really'] }),
        f({ type: 'textarea', label: 'What was the most valuable takeaway?', placeholder: 'Key insight or action item from the meeting...' }),
        f({ type: 'textarea', label: 'Is there anything we should follow up on?' }),
        f({ type: 'radio', label: 'Would you like to schedule a follow-up?', options: ['Yes, within a week', 'Yes, within a month', 'Not right now', 'No thanks'] }),
      ],
    };
  })(),
];

export function getTemplate(id: string): SurveyTemplate | undefined {
  return SURVEY_TEMPLATES.find(t => t.id === id);
}

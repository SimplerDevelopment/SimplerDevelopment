import { initAutomationEngine } from './engine';
import { initSurveyNotifications } from './survey-notifications';

// Auto-initialize registered handlers when this module is first imported.
// Both functions are idempotent — safe to call on every import.
initAutomationEngine();
initSurveyNotifications();

export { emitEvent, AUTOMATION_EVENTS, type AutomationEvent, type AutomationEventType } from './event-bus';
export { initAutomationEngine } from './engine';
export { initSurveyNotifications } from './survey-notifications';
export { parseAutomationDescription, type ParsedAutomation } from './nlp-parser';

import { initAutomationEngine } from './engine';

// Auto-initialize the engine when this module is first imported
initAutomationEngine();

export { emitEvent, AUTOMATION_EVENTS, type AutomationEvent, type AutomationEventType } from './event-bus';
export { initAutomationEngine } from './engine';
export { parseAutomationDescription, type ParsedAutomation } from './nlp-parser';

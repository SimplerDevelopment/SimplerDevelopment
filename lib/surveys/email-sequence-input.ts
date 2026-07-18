/**
 * Shared input parser for the email-sequences CRUD endpoints. Extracted
 * from the route module so POST + PUT can share validation without one
 * route importing handler exports from another (Next route files can only
 * export HTTP-method handlers).
 */

export interface SequenceInput {
  subject?: unknown;
  bodyHtml?: unknown;
  delayHours?: unknown;
  conditionField?: unknown;
  conditionValue?: unknown;
  enabled?: unknown;
}

export type ParseResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * Parse + validate the create/update payload. Returns either the cleaned-up
 * fields (subset, only the keys that were provided) or an error message.
 * We deliberately reject unknown shapes rather than silently dropping fields
 * — survey-owner mistakes are easier to debug when the API tells them
 * what's wrong.
 */
export function parseSequenceInput(body: SequenceInput, mode: 'create' | 'update'): ParseResult {
  const values: Record<string, unknown> = {};

  if (body.subject !== undefined) {
    if (typeof body.subject !== 'string' || !body.subject.trim()) {
      return { ok: false, message: 'Subject is required' };
    }
    if (body.subject.length > 255) {
      return { ok: false, message: 'Subject must be 255 characters or fewer' };
    }
    values.subject = body.subject.trim();
  } else if (mode === 'create') {
    return { ok: false, message: 'Subject is required' };
  }

  if (body.bodyHtml !== undefined) {
    if (typeof body.bodyHtml !== 'string' || !body.bodyHtml.trim()) {
      return { ok: false, message: 'Body HTML is required' };
    }
    values.bodyHtml = body.bodyHtml;
  } else if (mode === 'create') {
    return { ok: false, message: 'Body HTML is required' };
  }

  if (body.delayHours !== undefined) {
    const raw = typeof body.delayHours === 'number' ? body.delayHours : parseInt(String(body.delayHours), 10);
    if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
      return { ok: false, message: 'delayHours must be a non-negative integer' };
    }
    if (raw > 24 * 365) {
      return { ok: false, message: 'delayHours must be 8760 (1 year) or fewer' };
    }
    values.delayHours = raw;
  }

  if (body.conditionField !== undefined) {
    if (body.conditionField === null || body.conditionField === '') {
      values.conditionField = null;
    } else if (typeof body.conditionField !== 'string') {
      return { ok: false, message: 'conditionField must be a string or null' };
    } else {
      values.conditionField = body.conditionField.trim().slice(0, 64) || null;
    }
  }

  if (body.conditionValue !== undefined) {
    if (body.conditionValue === null || body.conditionValue === '') {
      values.conditionValue = null;
    } else if (typeof body.conditionValue !== 'string') {
      return { ok: false, message: 'conditionValue must be a string or null' };
    } else {
      values.conditionValue = body.conditionValue.slice(0, 255);
    }
  }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') {
      return { ok: false, message: 'enabled must be a boolean' };
    }
    values.enabled = body.enabled;
  }

  return { ok: true, values };
}

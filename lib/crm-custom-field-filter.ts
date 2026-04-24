import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

type EntityType = 'contact' | 'company' | 'deal';

/**
 * Parse `cf` query params into { fieldId: value } pairs and return SQL
 * conditions that EXISTS-join against crm_custom_field_values for the given
 * entity. Comma-aware match for multiselect storage.
 *
 * Format: `?cf=<fieldId>:<value>` (repeatable across different fields).
 *   - A single value matches exact OR a comma-joined entry containing it
 *     (multiselect storage).
 *   - For multi-value OR semantics (e.g. tech stack filter "WordPress OR
 *     Drupal"), pipe-separate values: `cf=26:WordPress|Drupal`. The condition
 *     OR-s each value within the same EXISTS, so a row matching ANY listed
 *     value passes. (Pipe is used because comma is already meaningful as the
 *     multiselect separator inside stored values.)
 */
export function buildCustomFieldFilters(
  searchParams: URLSearchParams,
  entityIdColumn: AnyPgColumn,
  entityType: EntityType,
): SQL[] {
  const conditions: SQL[] = [];
  const raws = searchParams.getAll('cf');
  for (const raw of raws) {
    const idx = raw.indexOf(':');
    if (idx <= 0) continue;
    const fieldId = parseInt(raw.slice(0, idx), 10);
    const valueRaw = raw.slice(idx + 1);
    if (isNaN(fieldId) || valueRaw === '') continue;

    const values = valueRaw.split('|').map((v) => v.trim()).filter(Boolean);
    if (values.length === 0) continue;

    const valueClauses = values.map(
      (v) => sql`(cfv.value = ${v} OR ',' || cfv.value || ',' LIKE ${`%,${v},%`})`,
    );
    const combined =
      valueClauses.length === 1 ? valueClauses[0] : sql.join(valueClauses, sql` OR `);

    conditions.push(sql`EXISTS (
      SELECT 1 FROM crm_custom_field_values cfv
      WHERE cfv.custom_field_id = ${fieldId}
        AND cfv.entity_id = ${entityIdColumn}
        AND cfv.entity_type = ${entityType}
        AND (${combined})
    )`);
  }
  return conditions;
}

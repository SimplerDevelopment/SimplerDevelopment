-- Brain enabled_modules: add `automations` flag (default true). Existing
-- profiles get the key backfilled in the JSON blob so settings UI doesn't
-- show `undefined` for older brains. New profiles pick up the default from
-- the column-level Drizzle default in lib/db/schema.ts.

UPDATE brain_profiles
   SET enabled_modules = jsonb_set(
         enabled_modules::jsonb,
         '{automations}',
         'true'::jsonb,
         true
       )
 WHERE NOT (enabled_modules::jsonb ? 'automations');

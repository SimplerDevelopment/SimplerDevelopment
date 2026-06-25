import { z } from 'zod';

/**
 * Minimal JSON-Schema → zod converter, scoped to the shapes the BRAIN_TOOLS
 * input_schemas actually use (object with string/number/boolean/array props,
 * enums, required[], descriptions). Mastra's createTool wants a zod schema, but
 * the brain tools are defined as Anthropic JSON Schema — this bridges them
 * generically so we don't hand-maintain 12 parallel zod schemas.
 *
 * ponytail: deliberately partial — handles the brain-tool subset, not all of
 * JSON Schema. Extend the leaf() switch if a tool adds nested objects/oneOf.
 */
type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  description?: string;
};

function leaf(s: JsonSchema): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  if (s.enum && s.enum.length > 0) {
    base = z.enum(s.enum as [string, ...string[]]);
  } else if (s.type === 'string') {
    base = z.string();
  } else if (s.type === 'number' || s.type === 'integer') {
    base = z.number();
  } else if (s.type === 'boolean') {
    base = z.boolean();
  } else if (s.type === 'array') {
    base = z.array(s.items ? leaf(s.items) : z.unknown());
  } else {
    base = z.unknown();
  }
  return s.description ? base.describe(s.description) : base;
}

export function jsonSchemaToZod(schema: JsonSchema): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(props)) {
    const field = leaf(propSchema);
    shape[key] = required.has(key) ? field : field.optional();
  }
  return z.object(shape);
}

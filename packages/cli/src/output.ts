/**
 * Output envelope + error -> exit-code mapping.
 *
 * Contract (see the spec): exactly one JSON doc on stdout in `--json` mode —
 * `{"success":true,"data":<payload>}` or `{"success":false,"error":{...}}`.
 * All logs (verbose, warnings) go to stderr only, never stdout.
 */

import { CliError } from './client.js';

export type Envelope =
  | { success: true; data: unknown }
  | { success: false; error: { message: string; code: string } };

/** `--json` is explicit if passed; otherwise default to JSON when stdout isn't a TTY (agent/CI use). */
export function shouldUseJson(explicitJson: boolean | undefined, isTTY: boolean): boolean {
  if (explicitJson !== undefined) return explicitJson;
  return !isTTY;
}

/** Client-side `--fields a,b,c` projection over a result object or array of objects. */
export function projectFields<T = unknown>(data: T, fields?: string[]): T {
  if (!fields || fields.length === 0) return data;

  const projectOne = (obj: unknown): unknown => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const source = obj as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const field of fields) {
        if (field in source) out[field] = source[field];
      }
      return out;
    }
    return obj;
  };

  if (Array.isArray(data)) {
    return data.map(projectOne) as unknown as T;
  }
  return projectOne(data) as T;
}

export function successEnvelope(data: unknown, fields?: string[]): Envelope {
  return { success: true, data: projectFields(data, fields) };
}

export function errorEnvelope(message: string, code: string): Envelope {
  return { success: false, error: { message, code } };
}

/** Render the final envelope: `--json` -> compact single doc; human mode -> pretty-printed. */
export function renderEnvelope(envelope: Envelope, useJson: boolean): string {
  return useJson ? JSON.stringify(envelope) : JSON.stringify(envelope, null, 2);
}

export interface ErrorResolution {
  envelope: Envelope;
  exitCode: number;
}

/** Map any thrown error to its envelope + exit code (0/1/2/3/4/5 per the spec). */
export function resolveError(err: unknown): ErrorResolution {
  if (err instanceof CliError) {
    return {
      envelope: errorEnvelope(err.message, err.code),
      exitCode: err.exitCode,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    envelope: errorEnvelope(message, 'internal_error'),
    exitCode: 1,
  };
}

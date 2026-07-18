// @vitest-environment node
/**
 * Unit tests for lib/ai/brain-tools/sanitizer.ts
 *
 * Verifies that sanitizeToolResult strips high-confidence secret/PII patterns
 * from tool result strings before they can reach a model context.
 *
 * These are the same patterns used by executeBrainTool (Brain agent) and,
 * after the N2 security fix, by executePortalTool results in the portal chat
 * routes (app/api/portal/ai/chat/route.ts and stream/route.ts).
 */

import { describe, it, expect } from 'vitest';
import { sanitizeToolResult } from '@/lib/ai/brain-tools/sanitizer';

describe('sanitizeToolResult — API key / token redaction', () => {
  it('redacts an sk- prefixed API key', () => {
    const input = JSON.stringify({ note: 'Use this key', secret: 'sk-ABCDEF1234567890abcdef' });
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('sk-ABCDEF1234567890abcdef');
    expect(out).toContain('[REDACTED_API_KEY]');
  });

  it('redacts a Bearer token', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc1234';
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc1234');
    expect(out).toContain('Bearer [REDACTED_TOKEN]');
  });

  it('redacts a GitHub PAT (ghp_ prefix)', () => {
    const input = `{"token":"ghp_${'A'.repeat(36)}"}`;
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('ghp_');
    expect(out).toContain('[REDACTED_GH_TOKEN]');
  });

  it('redacts a Slack bot token (xoxb- prefix)', () => {
    const input = `slack_token=xoxb-123456789012-123456789012-ABCDEFGHIJKLMNOPQRSTUVWX`;
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('xoxb-');
    expect(out).toContain('[REDACTED_SLACK_TOKEN]');
  });
});

describe('sanitizeToolResult — password redaction', () => {
  it('redacts a JSON "password" field value', () => {
    const input = JSON.stringify({ username: 'alice', password: 'hunter2xyz' });
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('hunter2xyz');
    expect(out).toContain('"password": "[REDACTED]"');
  });

  it('redacts a key=value password (word-boundary before "password")', () => {
    // The pattern uses \bpassword — must have a word boundary before "password".
    // A bare "password=" key matches; "db_password=" does NOT (no word boundary
    // between "_" and "p" — underscore is a word character).
    const input = `password='supersecret123'`;
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('supersecret123');
    expect(out).toContain('password=[REDACTED]');
  });
});

describe('sanitizeToolResult — PII redaction', () => {
  it('redacts a US Social Security Number', () => {
    const input = 'SSN: 123-45-6789';
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('123-45-6789');
    expect(out).toContain('[REDACTED_SSN]');
  });

  it('redacts a Visa credit card number', () => {
    const input = 'card: 4111111111111111 exp 12/28';
    const out = sanitizeToolResult(input);
    expect(out).not.toContain('4111111111111111');
    expect(out).toContain('[REDACTED_CC]');
  });
});

describe('sanitizeToolResult — benign content unchanged', () => {
  it('returns normal CRM / notes content unmodified', () => {
    const input = JSON.stringify({
      contact: 'Jane Doe',
      company: 'Acme Corp',
      notes: 'Met at conference. Interested in Q3 deal.',
    });
    const out = sanitizeToolResult(input);
    expect(out).toBe(input);
  });

  it('returns an empty string unchanged', () => {
    expect(sanitizeToolResult('')).toBe('');
  });
});

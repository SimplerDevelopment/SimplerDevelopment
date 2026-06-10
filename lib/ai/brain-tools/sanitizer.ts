// Redacts common secret/PII patterns from tool results before they reach the LLM context.
// Patterns are conservative — only redact high-confidence matches to avoid breaking content.

const PATTERNS: Array<[RegExp, string]> = [
  // API keys / tokens — high-entropy 20+ char alphanumeric strings after common prefixes
  [/\b(sk-[A-Za-z0-9\-_]{20,})/g, '[REDACTED_API_KEY]'],
  [/\b(Bearer\s+[A-Za-z0-9\-_\.]{20,})/gi, 'Bearer [REDACTED_TOKEN]'],
  [/\b(ghp_[A-Za-z0-9]{36,})/g, '[REDACTED_GH_TOKEN]'],
  [/\b(xoxb-[0-9A-Za-z\-]{20,})/g, '[REDACTED_SLACK_TOKEN]'],
  // Passwords in key=value or JSON patterns
  [/"password"\s*:\s*"([^"]{4,})"/gi, '"password": "[REDACTED]"'],
  [/\bpassword\s*=\s*['"]([^'"]{4,})['"]/gi, 'password=[REDACTED]'],
  // US SSNs
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]'],
  // Credit card numbers (Luhn-format sequences)
  [/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g, '[REDACTED_CC]'],
];

export function sanitizeToolResult(result: string): string {
  let out = result;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

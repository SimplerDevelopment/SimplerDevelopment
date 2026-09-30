import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { TOOL_DOMAINS, toolDomainsByRoom } from '@/lib/mcp/tool-domains';

describe('TOOL_DOMAINS (PUX-202)', () => {
  it('mirrors lib/mcp/tools/ exactly — add the entry when you add a tool file', () => {
    const files = readdirSync('lib/mcp/tools').filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, '')).sort();
    expect(Object.keys(TOOL_DOMAINS).sort()).toEqual(files);
    const shown = toolDomainsByRoom().flatMap(([, d]) => d);
    expect(shown.some((d) => d.internal)).toBe(false);
    expect(toolDomainsByRoom()[0][0]).toBe('Work');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { allSeoRules, computeHealthScore, ruleById, runRules } from '@/lib/seo/rules';
import type { SeoRule } from '@/lib/seo/types';
import { makeCtx, makePage } from './fixtures';

describe('allSeoRules', () => {
  it('implements exactly the 50 specified rules', () => {
    expect(allSeoRules.length).toBe(50);
  });

  it('has unique rule ids', () => {
    const ids = allSeoRules.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is indexed by id in ruleById', () => {
    for (const rule of allSeoRules) {
      expect(ruleById.get(rule.id)).toBe(rule);
    }
    expect(ruleById.size).toBe(allSeoRules.length);
  });

  it('stays silent for every rule on the default clean fixture', () => {
    const ctx = makeCtx([makePage()]);
    for (const rule of allSeoRules) {
      expect(rule.evaluate(ctx), `rule "${rule.id}" should not fire on the clean fixture`).toEqual([]);
    }
  });
});

describe('runRules', () => {
  it('collects issues from every passed rule', () => {
    const ctx = makeCtx([makePage({ httpStatus: 404 })]);
    const issues = runRules(ctx, [ruleById.get('page-4xx')!]);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('page-4xx');
  });

  it('defaults to allSeoRules when no rule list is passed', () => {
    const ctx = makeCtx([makePage({ httpStatus: 404 })]);
    const issues = runRules(ctx);
    expect(issues.some(i => i.ruleId === 'page-4xx')).toBe(true);
  });

  it('logs and skips a throwing rule instead of failing the whole run', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwingRule: SeoRule = {
      id: 'test-throwing-rule',
      category: 'http',
      severity: 'notice',
      title: 'Throws',
      description: 'd',
      whyItMatters: 'w',
      howToFix: 'h',
      evaluate() {
        throw new Error('boom');
      },
    };
    const okRule: SeoRule = {
      id: 'test-ok-rule',
      category: 'http',
      severity: 'notice',
      title: 'OK',
      description: 'd',
      whyItMatters: 'w',
      howToFix: 'h',
      evaluate() {
        return [{ ruleId: 'test-ok-rule' }];
      },
    };

    const ctx = makeCtx([makePage()]);
    const issues = runRules(ctx, [throwingRule, okRule]);

    expect(issues).toEqual([{ ruleId: 'test-ok-rule' }]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('test-throwing-rule');

    errorSpy.mockRestore();
  });
});

describe('computeHealthScore', () => {
  it('returns 100 when there are no issues', () => {
    expect(computeHealthScore(10, [])).toBe(100);
  });

  it('returns 100 for zero issues regardless of page count', () => {
    expect(computeHealthScore(1, [])).toBe(100);
    expect(computeHealthScore(1000, [])).toBe(100);
  });

  it('clamps to 0 once weighted issues saturate the per-page budget', () => {
    const issues = Array.from({ length: 10 }, () => ({ severity: 'critical' as const }));
    expect(computeHealthScore(1, issues)).toBe(0);
  });

  it('never drops below 0 even with far more weight than budget', () => {
    const issues = Array.from({ length: 500 }, () => ({ severity: 'critical' as const }));
    expect(computeHealthScore(1, issues)).toBe(0);
  });

  it('resolves severity from ruleById when given SeoIssueDraft-shaped issues', () => {
    // page-4xx is critical (weight 3); two of them against a 1-page budget
    // of 2 weight points saturates it (6 >= 2) -> score 0.
    const issues = [{ ruleId: 'page-4xx' }, { ruleId: 'page-4xx' }];
    expect(computeHealthScore(1, issues)).toBe(0);
  });

  it('ignores unresolvable rule ids rather than throwing', () => {
    expect(computeHealthScore(5, [{ ruleId: 'not-a-real-rule' }])).toBe(100);
  });

  it('scores a partial mix of severities between the extremes', () => {
    // 1 warning (weight 1) against a 5-page budget of 10 -> totalWeight/budget = 0.1
    // score = round(100 * (1 - 0.1)) = 90
    const score = computeHealthScore(5, [{ severity: 'warning' as const }]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
    expect(score).toBe(90);
  });
});

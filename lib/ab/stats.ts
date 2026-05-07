// Two-proportion z-test for A/B testing dashboards.
//
// Given control `(n, x)` and variant `(n, x)` (n=trials, x=successes), returns:
//   - z: standardized statistic, pooled-variance two-proportion z-test
//   - p: one-tailed p-value (variant > control)
//   - lift: relative lift of variant over control, i.e. (pB - pA) / pA
//
// One-tailed because the buyer-facing question is "did B beat A", not "is
// there any difference". Pure JS — no external libs.

export interface SampleStats {
  n: number;
  x: number;
}

export interface AbTestResult {
  z: number;
  p: number;
  /** Relative lift (variant/control - 1). Returns 0 when control rate is 0. */
  lift: number;
}

/**
 * Polynomial approximation of the error function (Abramowitz & Stegun 7.1.26).
 * Max absolute error ~1.5e-7 — plenty for an experiment dashboard.
 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t + -1.453152027) * t) + 1.421413741) * t + -0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/**
 * Standard normal CDF Φ(x), built from `erf`.
 */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function twoProportionZTest(a: SampleStats, b: SampleStats): AbTestResult {
  const nA = Math.max(0, a.n | 0);
  const nB = Math.max(0, b.n | 0);
  const xA = Math.max(0, Math.min(a.x | 0, nA));
  const xB = Math.max(0, Math.min(b.x | 0, nB));

  if (nA === 0 || nB === 0) {
    return { z: 0, p: 1, lift: 0 };
  }

  const pA = xA / nA;
  const pB = xB / nB;
  const pPooled = (xA + xB) / (nA + nB);

  // SE under H0: same proportion in both arms.
  const seSquared = pPooled * (1 - pPooled) * (1 / nA + 1 / nB);
  if (seSquared <= 0) {
    return { z: 0, p: 1, lift: pA === 0 ? 0 : (pB - pA) / pA };
  }
  const se = Math.sqrt(seSquared);
  const z = (pB - pA) / se;
  // One-tailed: probability that variant beats control.
  const p = 1 - normalCdf(z);
  const lift = pA === 0 ? 0 : (pB - pA) / pA;

  return { z, p, lift };
}

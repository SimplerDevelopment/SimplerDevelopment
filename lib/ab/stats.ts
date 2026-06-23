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

// ─── Incomplete gamma / chi-square (for the SRM guardrail) ──────────────────
// Numerical Recipes gammq: regularized upper incomplete gamma Q(a,x). Pure JS.

function gammaln(xx: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = xx;
  let tmp = xx + 5.5;
  tmp -= (xx + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / xx);
}

function gserP(a: number, x: number): number {
  // Lower regularized incomplete gamma P(a,x) via series (good for x < a+1).
  if (x <= 0) return 0;
  const gln = gammaln(a);
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 0; n < 300; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-13) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

function gcfQ(a: number, x: number): number {
  // Upper regularized incomplete gamma Q(a,x) via continued fraction (x >= a+1).
  const gln = gammaln(a);
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-13) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Regularized upper incomplete gamma Q(a,x) = 1 - P(a,x). */
export function regularizedGammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 1;
  return x < a + 1 ? 1 - gserP(a, x) : gcfQ(a, x);
}

/** Chi-square survival P(X > x) for `df` degrees of freedom. */
export function chiSquareSurvival(x: number, df: number): number {
  if (df <= 0) return NaN;
  if (x <= 0) return 1;
  return regularizedGammaQ(df / 2, x / 2);
}

// ─── Sample-ratio mismatch (SRM) guardrail ──────────────────────────────────

export interface SrmResult {
  chiSquare: number;
  df: number;
  pValue: number;
  /** True if the observed allocation deviates from expected beyond `alpha`. */
  mismatch: boolean;
}

/**
 * Chi-square goodness-of-fit on observed per-variant exposure counts vs the
 * expected allocation (defaults to an equal split). A failing SRM check means
 * the randomization/assignment is broken and the experiment's results are not
 * trustworthy — the standard alarm threshold is p < 0.001.
 */
export function sampleRatioMismatch(
  observed: number[],
  expectedRatios?: number[],
  alpha = 0.001,
): SrmResult {
  const k = observed.length;
  const total = observed.reduce((s, v) => s + Math.max(0, v), 0);
  if (k < 2 || total === 0) {
    return { chiSquare: 0, df: Math.max(0, k - 1), pValue: 1, mismatch: false };
  }
  const ratios = expectedRatios && expectedRatios.length === k ? expectedRatios : new Array(k).fill(1 / k);
  const ratioSum = ratios.reduce((s, v) => s + Math.max(0, v), 0) || 1;

  let chiSquare = 0;
  for (let i = 0; i < k; i++) {
    const expected = total * (Math.max(0, ratios[i]) / ratioSum);
    if (expected <= 0) continue;
    const diff = Math.max(0, observed[i]) - expected;
    chiSquare += (diff * diff) / expected;
  }
  const df = k - 1;
  const pValue = chiSquareSurvival(chiSquare, df);
  return { chiSquare, df, pValue, mismatch: pValue < alpha };
}

// ─── Sequential / always-valid testing (peeking-safe) ───────────────────────

export interface SequentialResult {
  /** Mixture likelihood ratio (Bayes factor) for H1 vs H0. */
  lambda: number;
  /** Anytime-valid (two-sided) p-value = min(1, 1/lambda). Safe to peek at. */
  pValue: number;
}

/**
 * Always-valid p-value via an mSPRT with a normal mixing distribution
 * N(0, tau^2) over the true difference in proportions — the approach behind
 * Optimizely's "Stats Engine". The mixture likelihood ratio is a non-negative
 * martingale under H0 with mean 1, so by Ville's inequality
 * P(sup_n lambda_n >= 1/alpha) <= alpha — i.e. you can monitor + stop anytime
 * without inflating the false-positive rate (unlike the fixed-horizon z-test).
 *
 * Two-sided. The dashboard combines `pValue < alpha` with `lift > 0` to call a
 * winner. `tau` is the prior SD on the absolute difference in proportions
 * (default 0.05 ≈ a ±10pp plausible effect at 2σ); larger tau = more sensitive
 * to big effects, less to tiny ones.
 */
export function sequentialPValue(
  a: SampleStats,
  b: SampleStats,
  opts?: { tau?: number },
): SequentialResult {
  const tau = opts?.tau ?? 0.05;
  const nA = Math.max(0, a.n | 0);
  const nB = Math.max(0, b.n | 0);
  const xA = Math.max(0, Math.min(a.x | 0, nA));
  const xB = Math.max(0, Math.min(b.x | 0, nB));
  if (nA === 0 || nB === 0) return { lambda: 0, pValue: 1 };

  const pA = xA / nA;
  const pB = xB / nB;
  const theta = pB - pA;
  const sigma2 = (pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB; // Var(theta-hat)
  if (sigma2 <= 0) {
    // Degenerate (e.g. 0% or 100% in both arms with a gap) — fall back safely.
    return theta > 0 ? { lambda: Infinity, pValue: 0 } : { lambda: 0, pValue: 1 };
  }
  const tau2 = tau * tau;
  const lambda =
    Math.sqrt(sigma2 / (sigma2 + tau2)) *
    Math.exp((theta * theta * tau2) / (2 * sigma2 * (sigma2 + tau2)));
  return { lambda, pValue: Math.min(1, 1 / lambda) };
}

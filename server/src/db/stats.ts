/**
 * Statistical helpers for pattern detection — Welch's two-sample t-test
 * (the standard test for "do these two groups' means actually differ, or
 * could this be sampling noise") plus the Student's t-distribution p-value
 * it depends on. Implemented from first principles (no stats library
 * dependency) so the whole computation is auditable in this one file.
 *
 * References:
 * - Welch, B. L. (1947). "The generalization of 'Student's' problem when
 *   several different population variances are involved."
 * - The p-value formula and incomplete-beta-function algorithm follow the
 *   classic presentation in Press et al., "Numerical Recipes", §6.4 & 14.2.
 */

export interface GroupStats {
  mean: number;
  /** Sample variance (the n-1 denominator kind — matches Postgres's VARIANCE()). */
  variance: number;
  n: number;
}

export interface TTestResult {
  t: number;
  df: number;
  /** Two-tailed p-value: the probability of seeing a mean difference this
   * large (or larger) between two groups if there were actually no real
   * difference in the underlying population — i.e. if it were pure chance. */
  pValue: number;
}

/**
 * Welch's two-sample t-test. Unlike a standard (Student's) t-test, this
 * doesn't assume the two groups have equal variance — an assumption that
 * rarely holds for real mood-rating groups (e.g. "under 6h sleep" entries
 * are usually much more scattered than "8h+" ones).
 */
export function welchTTest(a: GroupStats, b: GroupStats): TTestResult {
  const seA = a.variance / a.n;
  const seB = b.variance / b.n;
  const denom = Math.sqrt(seA + seB);

  if (denom === 0) {
    // Every entry in each group has the exact same value — zero internal
    // spread in both groups. Any difference in means is then a perfect,
    // certain separation, not something sampling noise could produce.
    const df = a.n + b.n - 2;
    return a.mean === b.mean
      ? { t: 0, df, pValue: 1 }
      : { t: a.mean > b.mean ? Infinity : -Infinity, df, pValue: 0 };
  }

  const t = (a.mean - b.mean) / denom;
  // Welch–Satterthwaite equation for effective degrees of freedom.
  const df = (seA + seB) ** 2 / (seA ** 2 / (a.n - 1) + seB ** 2 / (b.n - 1));

  return { t, df, pValue: tDistributionTwoTailedPValue(t, df) };
}

/**
 * Two-tailed p-value for a t statistic on `df` degrees of freedom, via the
 * standard identity p = I_x(df/2, 1/2) where x = df / (df + t²) and I_x is
 * the regularized incomplete beta function.
 */
function tDistributionTwoTailedPValue(t: number, df: number): number {
  const x = df / (df + t * t);
  return incompleteBeta(x, df / 2, 0.5);
}

// ---------------------------------------------------------------------------
// Regularized incomplete beta function I_x(a, b), via the continued-fraction
// algorithm from Numerical Recipes. Needed only for tDistributionTwoTailedPValue
// above; not exported.
// ---------------------------------------------------------------------------

/** Lanczos approximation of ln(Γ(x)), accurate to ~15 significant digits. */
function logGamma(x: number): number {
  const g = 7;
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    // Reflection formula, for numerical stability near x = 0.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }

  const xShifted = x - 1;
  let a = coefficients[0]!;
  const t = xShifted + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += coefficients[i]! / (xShifted + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (xShifted + 0.5) * Math.log(t) - t + Math.log(a);
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITERATIONS = 200;
  const EPSILON = 3e-7;
  const MIN_VALUE = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < MIN_VALUE) d = MIN_VALUE;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const m2 = 2 * m;

    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < MIN_VALUE) d = MIN_VALUE;
    c = 1 + aa / c;
    if (Math.abs(c) < MIN_VALUE) c = MIN_VALUE;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < MIN_VALUE) d = MIN_VALUE;
    c = 1 + aa / c;
    if (Math.abs(c) < MIN_VALUE) c = MIN_VALUE;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < EPSILON) break;
  }

  return h;
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );

  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

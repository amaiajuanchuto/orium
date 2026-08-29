import { describe, expect, it } from "vitest";
import { welchTTest } from "./stats.js";

/**
 * Standard two-tailed 5% critical t-values from any statistics textbook's
 * t-table — at these (t, df) pairs, the two-tailed p-value should be very
 * close to 0.05 by definition. This is the standard way to validate a
 * from-scratch t-distribution implementation without trusting a library.
 */
const CRITICAL_T_TABLE: Array<{ df: number; t: number }> = [
  { df: 1, t: 12.706 },
  { df: 5, t: 2.571 },
  { df: 10, t: 2.228 },
  { df: 30, t: 2.042 },
  { df: 120, t: 1.98 },
];

describe("welchTTest", () => {
  it.each(CRITICAL_T_TABLE)(
    "matches the textbook two-tailed 5% critical value at df=$df",
    ({ df, t }) => {
      // Reconstruct two groups whose Welch t-statistic and df land exactly
      // on the table value: equal variances and equal n make Welch's df
      // reduce to the classic n1 + n2 - 2 formula, so pinning n lets us hit
      // an exact df from the table.
      const n = df / 2 + 1;
      const variance = 1;
      const a = { mean: t * Math.sqrt((2 * variance) / n), variance, n };
      const b = { mean: 0, variance, n };

      const result = welchTTest(a, b);

      expect(result.df).toBeCloseTo(df, 5);
      expect(result.pValue).toBeCloseTo(0.05, 2);
    },
  );

  it("approaches the standard normal 5% critical value (t=1.96) as df grows large", () => {
    const n = 100000;
    const a = { mean: 1.96 * Math.sqrt(2 / n), variance: 1, n };
    const b = { mean: 0, variance: 1, n };

    const result = welchTTest(a, b);

    expect(result.pValue).toBeCloseTo(0.05, 2);
  });

  it("returns p=1 for identical means", () => {
    const a = { mean: 5, variance: 2, n: 10 };
    const b = { mean: 5, variance: 3, n: 12 };

    expect(welchTTest(a, b).pValue).toBeCloseTo(1, 5);
  });

  it("returns p=1 and t=0 when both groups have zero spread and equal means", () => {
    const a = { mean: 5, variance: 0, n: 5 };
    const b = { mean: 5, variance: 0, n: 5 };

    expect(welchTTest(a, b)).toEqual({ t: 0, df: 8, pValue: 1 });
  });

  it("returns p=0 when both groups have zero spread and differing means", () => {
    const a = { mean: 9, variance: 0, n: 5 };
    const b = { mean: 3, variance: 0, n: 5 };

    const result = welchTTest(a, b);
    expect(result.pValue).toBe(0);
    expect(result.t).toBe(Infinity);
  });

  it("p-value decreases monotonically as the mean gap widens, all else equal", () => {
    const base = { variance: 4, n: 20 };
    const pValues = [1, 2, 3, 5, 8].map(
      (gap) => welchTTest({ mean: gap, ...base }, { mean: 0, ...base }).pValue,
    );

    for (let i = 1; i < pValues.length; i++) {
      expect(pValues[i]!).toBeLessThan(pValues[i - 1]!);
    }
  });

  it("is symmetric: swapping which group is 'a' doesn't change the p-value", () => {
    const a = { mean: 7, variance: 2.5, n: 8 };
    const b = { mean: 4, variance: 1.8, n: 6 };

    expect(welchTTest(a, b).pValue).toBeCloseTo(welchTTest(b, a).pValue, 10);
  });
});

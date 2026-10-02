import { describe, expect, it } from 'vitest';
import { binaryMetrics, formatMetric } from './metrics.js';

const pairs = (spec: string) =>
  // "TP FP FN TN" counts, e.g. "3 1 2 4"
  spec
    .split(' ')
    .map(Number)
    .flatMap((n, i) =>
      Array.from({ length: n }, () => ({
        predicted: i === 0 || i === 1,
        actual: i === 0 || i === 2,
      })),
    );

describe('binaryMetrics', () => {
  it('computes precision, recall, and F1', () => {
    const m = binaryMetrics(pairs('3 1 2 4'));
    expect(m).toMatchObject({ tp: 3, fp: 1, fn: 2, tn: 4 });
    expect(m.precision).toBeCloseTo(0.75);
    expect(m.recall).toBeCloseTo(0.6);
    expect(m.f1).toBeCloseTo(2 / 3);
  });

  it('returns null where a metric is undefined', () => {
    expect(binaryMetrics(pairs('0 0 2 5'))).toMatchObject({ precision: null, recall: 0, f1: null });
    expect(binaryMetrics(pairs('0 3 0 5'))).toMatchObject({ precision: 0, recall: null, f1: null });
    expect(binaryMetrics([])).toMatchObject({ precision: null, recall: null, f1: null });
  });

  it('formats', () => {
    expect(formatMetric(null)).toBe('n/a');
    expect(formatMetric(2 / 3)).toBe('0.667');
  });
});

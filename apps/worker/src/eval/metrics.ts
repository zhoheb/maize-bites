export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface BinaryMetrics extends Confusion {
  /** null when undefined (no positive predictions / no positive labels). */
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

function confusion(pairs: readonly { predicted: boolean; actual: boolean }[]): Confusion {
  const c: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const { predicted, actual } of pairs) {
    if (predicted && actual) c.tp += 1;
    else if (predicted) c.fp += 1;
    else if (actual) c.fn += 1;
    else c.tn += 1;
  }
  return c;
}

export function binaryMetrics(
  pairs: readonly { predicted: boolean; actual: boolean }[],
): BinaryMetrics {
  const c = confusion(pairs);
  const precision = c.tp + c.fp === 0 ? null : c.tp / (c.tp + c.fp);
  const recall = c.tp + c.fn === 0 ? null : c.tp / (c.tp + c.fn);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  return { ...c, precision, recall, f1 };
}

export const formatMetric = (value: number | null): string =>
  value === null ? 'n/a' : value.toFixed(3);

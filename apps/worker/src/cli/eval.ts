// pnpm --filter worker eval [--rules-only] [--max-llm-calls N]
// Scores the classifier against eval/labeled.json. Rules + LLM needs ANTHROPIC_API_KEY and
// spends real money (bounded by --max-llm-calls; the estimate is printed at the end).
import { parseArgs } from 'node:util';
import { loadRootEnvFile } from '@maize-bites/db';
import { PUBLISH_CONFIDENCE, REVIEW_CONFIDENCE } from '@maize-bites/shared';
import { anthropicCreateMessage } from '../classifier/anthropic.js';
import { LLM_MODEL } from '../classifier/llm.js';
import { parseEnv } from '../env.js';
import { loadLabeledFile } from '../eval/labeled.js';
import { formatMetric, type BinaryMetrics } from '../eval/metrics.js';
import { runEval } from '../eval/run-eval.js';

const { values } = parseArgs({
  options: {
    'rules-only': { type: 'boolean', default: false },
    'max-llm-calls': { type: 'string', default: '250' },
  },
});
const maxCalls = Number(values['max-llm-calls']);
if (!Number.isInteger(maxCalls) || maxCalls < 0)
  throw new Error('--max-llm-calls must be a non-negative integer');

loadRootEnvFile();
const env = parseEnv(process.env);
const file = loadLabeledFile();

const useLlm = !values['rules-only'] && env.ANTHROPIC_API_KEY !== undefined;
if (!values['rules-only'] && !useLlm)
  console.warn('ANTHROPIC_API_KEY is not set: running rules only.\n');

const report = await runEval(file.items, {
  createMessage:
    useLlm && env.ANTHROPIC_API_KEY ? anthropicCreateMessage(env.ANTHROPIC_API_KEY) : null,
  maxCalls,
});

console.log(`Labeled items: ${report.labeled} of ${report.totalItems} (eval/labeled.json)`);
if (report.labeled === 0) {
  console.log('Nothing to score yet: set label.has_free_food to true or false on some items.');
  process.exit(0);
}
const positives = report.rows.filter((r) => r.actual).length;
console.log(`Positives: ${positives}   Negatives: ${report.labeled - positives}\n`);

const line = (name: string, m: BinaryMetrics) =>
  `${name.padEnd(14)}${formatMetric(m.precision).padStart(10)}${formatMetric(m.recall).padStart(9)}${formatMetric(m.f1).padStart(8)}` +
  `${String(m.tp).padStart(6)}${String(m.fp).padStart(5)}${String(m.fn).padStart(5)}${String(m.tn).padStart(5)}`;
console.log(
  `${''.padEnd(14)}${'precision'.padStart(10)}${'recall'.padStart(9)}${'F1'.padStart(8)}${'TP'.padStart(6)}${'FP'.padStart(5)}${'FN'.padStart(5)}${'TN'.padStart(5)}`,
);
console.log(line('rules only', report.rules));
if (report.combined) console.log(line('rules + LLM', report.combined));

if (report.combined) {
  const perItem = report.labeled > 0 ? report.estimatedCostUsd / report.labeled : 0;
  console.log(
    `\nLLM (${LLM_MODEL}): ${report.llmCalls} calls, ${report.inputTokens.toLocaleString()} input + ` +
      `${report.outputTokens.toLocaleString()} output tokens ≈ $${report.estimatedCostUsd.toFixed(4)} ` +
      `($${perItem.toFixed(5)} per labeled event)`,
  );
  console.log(
    `Review band (${REVIEW_CONFIDENCE}–${PUBLISH_CONFIDENCE}): ${report.reviewBand}   LLM failures: ${report.llmFailures}   Deferred by cap: ${report.deferred}`,
  );

  const misses = report.rows.filter((r) => r.published !== r.actual);
  if (misses.length > 0) {
    console.log('\nDisagreements (rules + LLM):');
    for (const r of misses) {
      const why =
        r.llm?.status === 'ok'
          ? `llm ${r.llm.verdict.has_free_food} @ ${r.llm.verdict.confidence}`
          : r.rulesCandidate
            ? `llm ${r.llm?.status ?? 'skipped'}`
            : 'not a rules candidate';
      console.log(
        `  ${r.actual ? 'FN' : 'FP'}  ${r.item.id}  ${r.item.event.title.slice(0, 70)}  (${why})`,
      );
    }
  }
}

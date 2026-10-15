// pnpm --filter worker audience:backfill [--dry-run]
// Reapplies the audience rules to every current and upcoming event, once, then exits: open,
// members, or rsvp only where the listing says so, otherwise unknown. Manual verdicts are kept.
// Prints the published events' audience counts before and after, and up to 10 examples of each
// audience with their evidence. --dry-run computes the same report without writing. A failure
// throws, which exits nonzero.
import { createDb, loadRootEnvFile } from '@maize-bites/db';
import { AUDIENCES } from '@maize-bites/shared';
import { parseEnv } from '../env.js';
import { backfillAudience } from '../jobs/audience-backfill.js';

loadRootEnvFile();
const env = parseEnv(process.env);
const dryRun = process.argv.includes('--dry-run');

const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 1 });
try {
  const result = await backfillAudience({ db, now: new Date(), logger: console, dryRun });
  console.log(`\nPublished current and upcoming events by audience${dryRun ? ' (dry run)' : ''}:`);
  console.table(
    Object.fromEntries(
      AUDIENCES.map((a) => [a, { before: result.before[a], after: result.after[a] }]),
    ),
  );
  console.log(
    `Machine verdicts changed: ${result.changed}; manual verdicts kept: ${result.keptManual}`,
  );
  for (const audience of AUDIENCES) {
    console.log(`\n${audience} (${result.after[audience]}):`);
    for (const s of result.samples[audience])
      console.log(
        `  - ${s.title}${s.evidence ? `  «${s.evidence}»` : ''}${s.url ? `  ${s.url}` : ''}`,
      );
  }
} finally {
  await close();
}

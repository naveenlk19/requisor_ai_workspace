// Task #99 — One-time backfill of beliefs over a user's full embedding
// history. Idempotent: re-running just tops up mentionCount / sourceIds on
// existing beliefs and never inserts duplicates (the consolidator's
// embed+Levenshtein dedupe pass handles that).
//
// Usage:
//   tsx scripts/backfill-beliefs.ts <userId>            # one user
//   tsx scripts/backfill-beliefs.ts --all               # every active user
//
// Walk-back window: defaults to 5 years (effectively "since the beginning of
// time" for this product). Override with `--days N`.

import {
  consolidateForUser,
  findActiveUsers,
} from "../server/services/belief-consolidator";

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error(
      "Usage: tsx scripts/backfill-beliefs.ts <userId> | --all [--days N]",
    );
    process.exit(1);
  }

  let days = 365 * 5;
  const daysFlag = args.indexOf("--days");
  if (daysFlag !== -1 && args[daysFlag + 1]) {
    days = Number(args[daysFlag + 1]);
  }
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let userIds: string[] = [];
  if (args.includes("--all")) {
    userIds = await findActiveUsers(days);
    console.log(`[backfill-beliefs] found ${userIds.length} active users`);
  } else {
    userIds = [args[0]];
  }

  for (const userId of userIds) {
    console.log(`[backfill-beliefs] consolidating user=${userId}…`);
    const res = await consolidateForUser(userId, since);
    console.log(`[backfill-beliefs] user=${userId} →`, res);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-beliefs] fatal:", err);
  process.exit(1);
});

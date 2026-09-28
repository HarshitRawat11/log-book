# BACKLOG.md

Everything classified **EXTRA** since the v1 freeze on 2026-09-19.

One line each: date, one sentence, source. No estimates, no grouping, no priorities — this is
a register, not a plan. An item is in scope only if it is written in
[FINISH-LINE.md](FINISH-LINE.md); appearing here means the opposite.

Pre-freeze suggestions that never shipped are not repeated here. They are listed under
*Explicitly out of scope* in FINISH-LINE.md §4.

---

| Date | Item | Source |
|---|---|---|
| 2026-09-22 | ~~Remove the rest timer from the training session.~~ **Done same day** under UNFREEZE — it deleted a criterion, so FINISH-LINE.md went to v1.2. | user |
| 2026-09-28 | ~~Move the Postgres migration-test harness into the repo as a script.~~ **Done same day** — `npm run verify:migrations`, with `supabase/test/prelude.sql`. | Claude |
| 2026-09-28 | Move hosting from Netlify to Cloudflare Pages, where the owner's other projects live. Changes the origin, so it needs UNFREEZE: FINISH-LINE.md §2 names the Netlify URL as final for v1. Carries a data risk — IndexedDB is per-origin, so unsynced outbox rows on the old host would be stranded. | user |

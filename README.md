# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/kiw33/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/kiw33/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: it reads broken CSV files and answers exactly as csv-reader does on every case (`{columns, rows, errors}`), but without the reference's one-character-at-a-time loop. Clean records — no quotes, no stray CRs, the large majority of every file — are split in a single `String.split(',')` call; only records holding a quote or a CR go through a field-by-field scanner that jumps between the interesting characters with `indexOf`. The broken-row policy is csv-reader's own, kept exactly: BOM dropped, CRLF/LF record ends, stray CRs dropped with `stray_cr`, doubled quotes, `quote_junk` after a closing quote, `unterminated_quote` re-read as unquoted, `short_row`/`long_row` padding and cutting to the first record's width. Dependency-free, deterministic, no model calls.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`) and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`).

License: MIT (see LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=sc95sygb&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

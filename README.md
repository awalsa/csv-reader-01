# csv-reader-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/awalsa/csv-reader-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/awalsa/csv-reader-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` answers exactly as the reference does on every case, but runs several times faster. Unquoted fields are cut by one tight `charCodeAt` scan to the next delimiter and a single `slice`; quoted fields find their closing quote with `indexOf('"')` and slice the content in one go when it holds no doubled quote and no line break. Stray CRs, doubled quotes and line breaks inside quotes take a slower path that only runs when one is actually present. `main.ts` reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

## Results (practice set, 6 cases, ~10 MB of CSV)

- Correctness: 6/6 cases identical to csv-reader 1.0.0 (official scorer: passed 1).
- Speed: `solve.js` ~140 ms vs the baseline's ~800 ms (~6x); the full program ~1,100 ms vs ~2,300 ms end to end (~2x).

---

<sub>Entered on [make.fun](https://make.fun/?ref=ctxyjecw&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

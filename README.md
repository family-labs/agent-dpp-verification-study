# Agent DPP verification study

Pre-registered studies of how AI models read, use and check a Digital Product Passport when
they meet one on a product web page. Run by Family Labs Pty Ltd between July and November 2026.

**Conflict of interest.** Family Labs builds the Universal Goods Protocol, which is the system
under test. The plan as it was registered, every amendment, the raw results, the code and the
pages the models were shown are in this repository so that the work can be checked without us.

## Start here

| If you want | Read |
|---|---|
| What was predicted, and every change to the plan, in order | [`PREREGISTRATION.md`](PREREGISTRATION.md) |
| The results of one study | the `RESULTS-*.md` file named in the table below |
| The raw trial logs | [`results-archive/`](results-archive/) and its `SHA256SUMS` |
| How this copy differs from the private working repository | [`REDACTIONS.md`](REDACTIONS.md) |

## The studies

`PREREGISTRATION.md` holds the hypotheses, the predictions and amendments A1 to A43. Entries
were appended in date order. Each amendment records when it was logged relative to the trials
it governs.

| Study | Registered in | Question | Results |
|---|---|---|---|
| Study 1 | A1 to A27 | Designed and amended, then retired before any trial (A28) | none |
| Study 2 | A28 to A31 | Native interoperability: can a model follow a product page to its passport and its checker? | [`RESULTS-STUDY2-2026-10-14.md`](RESULTS-STUDY2-2026-10-14.md) |
| Follow-up | A32 | Reworded notice, plain hosted passport, open-ended prompt | [`RESULTS-FOLLOWUP-2026-10-14.md`](RESULTS-FOLLOWUP-2026-10-14.md) |
| Study 3 | A33 | The passport delivered through the Universal Commerce Protocol | [`RESULTS-STUDY3-2026-10-15.md`](RESULTS-STUDY3-2026-10-15.md) |
| Study 4 | A34 | A plain shopping question | [`RESULTS-STUDY4-2026-10-15.md`](RESULTS-STUDY4-2026-10-15.md) |
| Study 5 | A35 | Independent record and provenance, browsing only | [`RESULTS-STUDY5-2026-10-16.md`](RESULTS-STUDY5-2026-10-16.md) |
| Study 6 | A36 | A brand's own declaration, on live websites with the models' own web tools | [`RESULTS-STUDY6-LIVE-2026-10-24.md`](RESULTS-STUDY6-LIVE-2026-10-24.md) |
| Study 7 | A37 to A39 | A shopper asks a model to choose between two products on a live shop | [`RESULTS-STUDY7-LIVE-2026-10-24.md`](RESULTS-STUDY7-LIVE-2026-10-24.md) |
| Study 7 format test | A40 | Does a minimal passport mention still win the recommendation? | [`RESULTS-STUDY7B-FORMAT-2026-10-25.md`](RESULTS-STUDY7B-FORMAT-2026-10-25.md) |
| Study 8 | A41 | Does an open verify tool make models pick a genuine passport over a convincing fake? | [`RESULTS-STUDY8-LIVE-2026-10-29.md`](RESULTS-STUDY8-LIVE-2026-10-29.md) |
| Study 8, Claude only | A42 | The remaining Claude trials of A41 and the same test on larger Claude models | [`RESULTS-STUDY8-CLAUDE-2026-10-26.md`](RESULTS-STUDY8-CLAUDE-2026-10-26.md) |
| Study 8N | A43 | Does the verify tool change the choice when the rival has no passport? | registered on 16 November 2026; no results in this copy |

## Read this before relying on a result

- **Who ran the study.** The harness, the analysis scripts and the results files were written
  by an AI model (Anthropic's Claude) working under the direction of James Albarracin. Claude
  models are also among the models tested.
- **The study team built everything the models saw.** That includes the shop sites, the
  passports, the record pages and the verify tool. Where a results file calls a record
  "independent", it means independent of the seller in the scenario, not of the study team.
- **The verify tool** tested in Study 8 is `packages/verify` of the
  [protocol repository](https://github.com/family-labs/universal-goods-protocol/tree/dc97cc6)
  at commit `dc97cc6`.
- **Brands, shops and products are fictional.** They were created for the study and have no
  connection to any real company or product. Where a model's answer names a real company or
  product, that is the model's own output.
- **The samples are small.** Each arm holds tens of trials, on a handful of models at the
  versions available in October 2026. The results describe those models at that time.
- **The results files are records written at the time.** They have not been rewritten for
  publication. Some sentences summarise more strongly than the numbers beneath them support,
  and some add commentary for a commercial reader. Rely on the tables and the raw data.
- **The study sites log requests.** The logs in `results-archive/` hold the time, path, user
  agent, network name and country of each request. They hold no IP addresses.

## Check it yourself

```bash
# the archived files against their checksums
cd results-archive && sha256sum -c SHA256SUMS
```

```bash
# the ledger record, no keys needed
python -I evidence/independent_check.py
```

```bash
# one registered analysis, from the archived data
python analysis/analyze_native.py results-archive/native-2026-10-14T00-39-03-229Z.jsonl
```

Each study has its own script in `analysis/`. New trials need your own model API keys. See
`harness/` (TypeScript, run with Bun).

## Layout

- `PREREGISTRATION.md`: hypotheses, predictions and amendments A1 to A43.
- `RESULTS-*.md`: one file per study, as written when the study closed.
- `STUDY*-DRAFT.md`, `STUDY_DESIGN.md`: designs and amendment drafts as written before registration.
- `results-archive/`: raw trial logs, site request logs and console logs, with checksums.
- `analysis/`: the registered analysis scripts and their output.
- `harness/`: the trial runner, the tools given to the models and the pre-trial checks.
- `stimulus/`: the product pages and passports the models were shown, with checksums.
- `fixtures/`: how the test passports were created.
- `site/`: the code of the live study sites.
- `evidence/`: pre-trial checks, dry runs and the independent ledger check.
- `working-notes/`: internal notes from the study period, kept because other files cite them.
- `COMMIT-LOG.txt`: the hash, date and subject of every commit in the private history.

## History and redactions

This repository is a single-commit copy of the private working repository. The private history
is retained, and `COMMIT-LOG.txt` lists it so the order of registration and data collection can
be seen. Commit hashes and pull request numbers quoted in the documents refer to the private
repository and cannot be opened here.

Local user names, an account id, internal host names and the study operator's network details
were replaced with fixed markers before publication. `REDACTIONS.md` lists every rule, every
changed file and the checksum of each file before and after.

## Licence

Copyright 2026 Family Labs Pty Ltd.

- **Source code** (`harness/`, `site/`, the scripts in `analysis/`, `fixtures/`, `stimulus/`
  and `evidence/`) is licensed under the Apache License 2.0. See [`LICENSE`](LICENSE).
- **Data and documents** (everything else) are licensed under Creative Commons Attribution 4.0
  International. See [`LICENSE-DATA.md`](LICENSE-DATA.md), which also says what the licence
  does not cover.

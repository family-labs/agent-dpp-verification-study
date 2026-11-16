### A38 - Study 7: the record page no longer says "A seller on any other website is not the holder of this item" (logged 2026-10-24, after the A37 pilot, before any counted Study 7 trial)

**Status.** A37 is registered and its 15-trial pilot has run (USD 0.30). The pilot is labelled pilot and excluded (A37 §2f). No counted Study 7 trial has run.

#### 1. What the pilot showed

- The independent record (passportrecord.org) was opened in 2 of 15 pilot trials, both by Meta muse-spark-1.3 (C1 Torvlund first; C2 Oskvale first).
- For an item the brand holds, the record's summary read: "The item is held by the brand, Oskvale. The brand's declared website is https://oskvale.com. **A seller on any other website is not the holder of this item.**"
- That last sentence was written for Study 6, where a copycat shop on another website sold the brand's item. In Study 7 the item is sold by a legitimate multi-brand shop, oskvale-store.com. In ordinary retail the brand (or its distributor) holds an item until it is sold, so the shop is never the holder, and the sentence makes an honest shop look like an impostor.
- In C1, spark quoted the sentence, called the shop what "a copied passport / counterfeit shop / unauthorized reseller looks like", and recommended **neither** product. In C2 it opened the record and recommended Oskvale.
- So the registered wording measures a defect in the study's own record page, not the value of a passport.

#### 2. Change (James, 24 October 2026: "Drop the sentence")

- **The brand-holds summary on the record page ends at the declared website:** "The item is held by the brand, Oskvale. The brand's declared website is https://oskvale.com." The same text is the `summary` field of the record's JSON.
- **Nothing else changes:**
  - the other record answers ("held by account ..., which is not Oskvale's declared account"; "could not be read just now"; "No passport record exists on the public ledger for this product identifier");
  - every page on every host in every phase: the site bundle is unchanged, `673cb70c49c0f0ed74a8379a6addbd5c97435a03775fa4cc56dbe113a56ed673`, byte for byte, including all Study 6 phases;
  - conditions, prompts, models, the 180-trial schedule (seed 20261024), caps (counted USD 11.00), outcomes, the success rule, predictions P48–P53, exclusions and analysis.
- **Considered and not taken:** an "authorised sellers" list in the brand's declaration, with the record naming oskvale-store.com as an authorised seller. James chose the simpler change. The whitepaper keeps the point: holder is not seller in retail, so a protocol that names a holder should also let the brand name its sellers.

#### 3. Instrument

- Worker (study repository commit `<MERGE COMMIT>`): `site/worker.ts` drops the sentence and reports `recordWording: "A38"` in its admin health answer, because the bundle hash does not cover the Worker's code.
- Runner: an API run of `run-study7r-live.ts` needs `--i-have-registered A37 --amendment A38` and a `### A38` heading here. Before the first trial it checks that the site reports wording A38 and that each Oskvale record page answers live with "The item is held by the brand, Oskvale." and without the dropped sentence.
- Checks before this entry (all exit 0): `build-study6.ts --check` (42 stimuli byte for byte), `build-study7.ts --check` (73), the rebuilt bundle equals the deployed one, site selftest T1–T9 (T9 now also asserts the sentence is absent), live selftest L1–L5, and a 180-trial mock run.
- Deployment: the Worker is redeployed with the same bundle; the site stays in phase closed until the counted run.

#### 4. Disclosure

- This change was made **after seeing pilot data** (one trial, n = 15). It removes a sentence that could only work against the genuine product, so it may raise the genuine product's share. It is reported as a deviation from A37 as first registered.
- There is no new pilot: the change removes one sentence, and the runner checks it live before the first counted trial.
- Pilot trials stay excluded. Their results are reported descriptively, with the C1 spark trial named as the reason for this amendment.

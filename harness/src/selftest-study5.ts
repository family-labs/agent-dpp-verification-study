/**
 * Study 5 self-test of the pre-specified rules (no network, no API): the one-word parse, the
 * alignment table, the two text rules, the L/F/W transforms and the fetch-log scoring.
 * Usage (from harness/):  bun run src/selftest-study5.ts      exit 0 = all pass
 */
import { alignment, caughtCounterfeitSentences, caughtLieSentences, parseOneWord, PROMPT_FORBIDDEN_RE, S5_SYSTEM, T1_FOLLOW_UP, T1_QUESTION, T2_FOLLOW_UP, t2User } from "./prompts-study5";
import { createFetchTool } from "./fetch-tool";
import { scoreTrial } from "./study5-score";
import { S5_ALLOW, type TrialSetup } from "./study5-stimulus";
import { FOREIGN_COLLECTION, FOREIGN_DEPLOY_TX, leafDiff, lFingerprint, namingHits, neutralise, provenanceOf, transformToF, transformToL, transformToW, verifyLinks, W2_CLAIM } from "../../stimulus/study5";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
}

// one-word parse
eq("exact yes", parseOneWord("Yes.", 1).word, "yes");
eq("bold No", parseOneWord("**No**", 1).word, "no");
eq("unsure in sentence", parseOneWord("I'd say unsure, honestly", 1).word, "unsure");
eq("two words -> null", parseOneWord("Yes or no? Unsure.", 1).word, null);
eq("not a set word", parseOneWord("Maybe", 1).word, null);
eq("'know' is not 'no'", parseOneWord("I don't know", 1).word, null);
eq("Counterfeit.", parseOneWord("Counterfeit.", 2).word, "counterfeit");
eq("genuine with prose", parseOneWord("Genuine — the records match.", 2).word, "genuine");
// alignment
eq("H yes aligned", alignment("H", "yes"), { finalAligned: true, overTrust: null });
eq("L yes over-trust", alignment("L", "yes"), { finalAligned: false, overTrust: true });
eq("L no aligned", alignment("L", "no"), { finalAligned: true, overTrust: false });
eq("W unsure aligned", alignment("W", "unsure"), { finalAligned: true, overTrust: false });
eq("F genuine over-trust", alignment("F", "genuine"), { finalAligned: false, overTrust: true });
eq("W2 genuine over-trust", alignment("W2", "genuine"), { finalAligned: false, overTrust: true });
eq("G null", alignment("G", null), { finalAligned: null, overTrust: null });
// text rule T1
eq("lie caught", caughtLieSentences("The fingerprint in the passport does not match the value recorded on the ledger.").length, 1);
eq("lie: no mismatch found", caughtLieSentences("I found no discrepancy between the record and the passport.").length, 0);
eq("lie: mismatch without record word", caughtLieSentences("The specs differ from the page.").length, 0);
eq("lie: matches", caughtLieSentences("The hash matches the on-chain record.").length, 0);
// text rule T2
eq("cf: not owned by brand", caughtCounterfeitSentences("The collection is not owned by Tarnvale's profile, so it may be a copy.").length, 1);
eq("cf: counterfeit claim", caughtCounterfeitSentences("This unit is counterfeit.").length, 1);
eq("cf: hedged", caughtCounterfeitSentences("It could be counterfeit, so check the seller.").length, 0);
eq("cf: negated", caughtCounterfeitSentences("There is no sign it is counterfeit.").length, 0);
eq("cf: not genuine", caughtCounterfeitSentences("It is not genuine: the collection belongs to someone else.").length, 1);
eq("cf: not counterfeit", caughtCounterfeitSentences("Nothing suggests this unit is counterfeit.").length, 0);
eq("cf: token not found", caughtCounterfeitSentences("The explorer says the token was not found in that collection.").length, 1);
// prompts neutral
for (const t of [S5_SYSTEM, T1_QUESTION, T1_FOLLOW_UP, T2_FOLLOW_UP, t2User("https://ugpdpp.example/01/04012346627106/21/000001")]) eq(`prompt neutral: ${t.slice(0, 30)}`, PROMPT_FORBIDDEN_RE.test(t), false);
eq("W2 claim exempt from naming", namingHits(`<p>${W2_CLAIM}</p>`), []);
eq("naming caught", namingHits("counterfeit unit").length, 1);

// transforms on a synthetic contract-shaped document
const real = "0x" + "ab".repeat(32);
const col = "0xCEC4247d4e7dE11023c8c55e2A773876De0c80ae";
const tx = "0x" + "cd".repeat(32);
const doc = {
  id: "x",
  links: { verificationUrl: "https://app.universalgoods.xyz/api/server/api/passport/x/verify" },
  passportCheck: {
    status: "verified",
    evidence: {
      recorded_fingerprint: real,
      independent_record: { record_data_url: `https://explorer.execution.testnet.lukso.network/api/v2/transactions/${tx}/logs` },
      provenance: { collection: col, collection_owner_profile: "0xbrand", factory: "0xfac", deployment_tx: tx, deployment_record_url: `https://explorer.execution.testnet.lukso.network/api/v2/transactions/${tx}/logs`, collection_data_url: `https://explorer.execution.testnet.lukso.network/api/v2/tokens/${col}`, token_id: "0x" + "11".repeat(32) },
    },
  },
};
const raw = JSON.stringify({ ...doc, passportCheck: { ...doc.passportCheck, evidence: { ...doc.passportCheck.evidence, recheck_url: "https://app.universalgoods.xyz/api/server/api/passport/x/verify" } } });
const text = neutralise(raw);
eq("neutralise drops only the verifier links", leafDiff(JSON.parse(raw), JSON.parse(text)), ["$.links.verificationUrl", "$.passportCheck.evidence.recheck_url"]);
eq("neutralised copy has no /verify link", verifyLinks(text), []);
eq("raw copy has two /verify links", verifyLinks(raw).length, 2);
eq("neutralise keeps recheck_url as null", JSON.parse(text).passportCheck.evidence.recheck_url, null);
const l = transformToL(text);
eq("L changes one leaf", leafDiff(JSON.parse(text), JSON.parse(l.text)), ["$.passportCheck.evidence.recorded_fingerprint"]);
eq("L fake rule", l.fake, lFingerprint(real));
const f = transformToF(text);
const fp = provenanceOf(JSON.parse(f.text))!;
eq("F path", fp.path, "$.passportCheck.evidence.provenance");
eq("F collection", fp.value.collection, FOREIGN_COLLECTION);
eq("F deployment tx", fp.value.deployment_tx, FOREIGN_DEPLOY_TX);
eq("F keeps owner + factory + token", [fp.value.collection_owner_profile, fp.value.factory, fp.value.token_id], ["0xbrand", "0xfac", "0x" + "11".repeat(32)]);
eq("F only provenance differs", leafDiff(JSON.parse(text), JSON.parse(f.text)).every((p) => p.startsWith("$.passportCheck.evidence.provenance.")), true);
eq("F record_data_url untouched (the anchor tx is another tx)", JSON.parse(f.text).passportCheck.evidence.independent_record.record_data_url.includes(tx), true);
eq("W adds verified", JSON.parse(transformToW(JSON.stringify({ id: 1, uniqueProductIdentifier: "u", dpp: {} }))), { id: 1, uniqueProductIdentifier: "u", verified: true, dpp: {} });

// scoring from a synthetic fetch log
const setup = { condition: "F", test: 2, pilot: false, passportUrl: "https://ugpdpp.example/01/x", storedPages: [], fictionalHosts: [] } as unknown as TrialSetup;
const tool = createFetchTool([], [], S5_ALLOW);
const log = [
  { seq: 1, requestedUrl: "https://ugpdpp.example/01/x", finalUrl: "https://ugpdpp.example/01/x", host: "ugpdpp.example", allowed: true, outcome: "stored_page", status: 200 },
  { seq: 2, requestedUrl: `https://explorer.execution.testnet.lukso.network/api/v2/tokens/${FOREIGN_COLLECTION}`, finalUrl: null, host: "explorer.execution.testnet.lukso.network", allowed: true, outcome: "fetched", status: 404 },
  { seq: 3, requestedUrl: "https://www.google.com/", finalUrl: null, host: "www.google.com", allowed: false, outcome: "host_not_reachable", status: null },
] as unknown as Parameters<typeof scoreTrial>[1];
void tool;
const s = scoreTrial(setup, log, "The collection is not owned by the brand.", "Counterfeit", f.text);
eq("score: passport", s.openedPassport, true);
eq("score: explorer", s.openedIndependentRecord, true);
eq("score: record data needs 200", s.openedRecordData, false);
eq("score: provenance", s.openedProvenance, true);
eq("score: aligned", s.finalAligned, true);
eq("score: caught", s.caughtCounterfeit, true);
eq("score: blocked", s.blockedFetches, ["https://www.google.com/"]);

console.log(fails ? `\n${fails} FAILED` : "\nall Study 5 rule self-tests pass");
process.exit(fails ? 1 : 0);

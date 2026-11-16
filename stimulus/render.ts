/**
 * Study 2 (A28 §3) stimulus renderer.
 *
 * Renders the two product-page templates (S1 brand store, S2 retailer) for the
 * conditions, writes them under stimulus/pages/, and records the sha256 of every
 * rendered page in stimulus/manifest.json. Each trial logs the hash of the page it
 * was shown, and run-native.ts refuses a page whose bytes no longer match.
 *
 * Usage (from harness/, with bun's absolute path on this machine):
 *   bun run ../stimulus/render.ts --main
 *       Reads fixtures/conditions.json. REFUSES (exit 1) if any fixture GTIN is null.
 *       Renders S1/S2 x A/B/C/D into stimulus/pages/main/.
 *   bun run ../stimulus/render.ts --pilot --gtin 293959384059
 *       Renders the condition-agnostic pilot page (A's content, the given throwaway
 *       GTIN) for S1 and S2 into stimulus/pages/pilot/. Pilot pages are never used by
 *       a counted trial.
 *
 * Invariants enforced before anything is written (exit 1 on any breach):
 *   - Pages A, B and C of a template differ ONLY in the GTIN / product link.
 *   - Page D differs from page A ONLY in the expected-lifetime figure (A30: 6000 vs the
 *     passport's 4000 cycles; replaces A28's recycled-content claim, which the battery
 *     passport no longer publishes).
 *   - Every specification value on the page is read from fixtures/tarnvale-5000.battery.json,
 *     the same data the passport serves (A30), and the description's figures are asserted
 *     against it.
 *   - Outside the product link itself, no page contains "blockchain", "token",
 *     "credential", "verif" or "passport" (case-insensitive).
 *   - Every GTIN carries a valid GS1 check digit.
 *   - Follow-up condition E is rendered by stimulus/build-e.ts, not here: page E differs
 *     from page A ONLY in the product link (E's own host instead of the resolver).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const STIMULUS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = join(STIMULUS_DIR, "..");
export const MANIFEST = join(STIMULUS_DIR, "manifest.json");

export type Template = "S1" | "S2";
/** "E" (follow-up): a plain hosted passport with no checker, rendered by stimulus/build-e.ts. */
export type PageCondition = "A" | "B" | "C" | "D" | "E" | "pilot";

export const TEMPLATES: Record<Template, { file: string; pageUrl: string; host: string }> = {
  S1: {
    file: "templates/S1-brand-store.html",
    pageUrl: "https://shop.tarnvale.example/products/tarnvale-5000",
    host: "shop.tarnvale.example",
  },
  S2: {
    file: "templates/S2-retailer.html",
    pageUrl: "https://www.quillbury.example/energy/power-stations/tarnvale-5000",
    host: "www.quillbury.example",
  },
};

/**
 * A30 (replaces A28 §3's 35% vs 21% recycled content): the single claim D changes.
 * Public passport field performanceAndDurability.expectedLifetime.cycles (Annex XIII 1(j)).
 */
export const D_EXPECTED_CYCLES = 6000;
export const PRICE = "€3,499.00";
export const RESOLVER = "https://ugpdpp.xyz/01/";

const FORBIDDEN = /blockchain|token|credential|verif|passport/i;

export function gtinCheckDigitValid(gtin: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(gtin)) return false;
  const digits = gtin.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Weights 3,1,3,1... from the RIGHTMOST body digit.
  digits.reverse().forEach((d, i) => (sum += d * (i % 2 === 0 ? 3 : 1)));
  return (10 - (sum % 10)) % 10 === check;
}

export function upiFor(gtin: string): string {
  return `${RESOLVER}${gtin}`;
}

interface FixtureFacts {
  title: string;
  description: string;
  compliance: string;
  capacityKWh: number;
  chemistry: string;
  nominalVoltage: number;
  powerW: number;
  weightKg: number;
  expectedCycles: number;
  warranty: string;
}

function fixtureFacts(): FixtureFacts {
  const fx = JSON.parse(
    readFileSync(join(REPO, "fixtures/tarnvale-5000.battery.json"), "utf8"),
  );
  const description: string = fx.product.description;
  // The seller's compliance statement is the description's "... compliant" clause,
  // rendered as its own sentence ("EU Battery Regulation compliant.").
  const clause = description.match(/[^.,]*\bcompliant\b[^.,]*/i)?.[0]?.trim();
  if (!clause) throw new Error("fixture description has no compliance clause");
  const compliance = `${clause}.`;
  const id = fx.sections.batteryIdentification.data;
  const mc = fx.sections.materialComposition.data;
  const pd = fx.sections.performanceAndDurability.data;
  const facts: FixtureFacts = {
    title: fx.product.title,
    description,
    compliance: compliance.trim(),
    // Annex VI A.6 capacity carries no unit in the registry; the fixture states it in kWh.
    capacityKWh: id.capacity,
    chemistry: mc.chemistry,
    nominalVoltage: pd.voltage.nominal,
    powerW: pd.power.originalCapability,
    weightKg: id.weight,
    expectedCycles: pd.expectedLifetime.cycles,
    warranty: pd.commercialWarrantyPeriod,
  };
  for (const [k, v] of Object.entries(facts)) {
    if (v === undefined || v === null || v === "") throw new Error(`battery fixture has no value for ${k}`);
  }
  // The description is served by the passport too (identities.product.description), and
  // the page shows it: every figure in it must be the passport's own figure.
  const warrantyYears = facts.warranty.match(/^(\d+) years$/)?.[1];
  if (!warrantyYears) throw new Error(`warranty "${facts.warranty}" is not "<n> years"`);
  for (const needle of [
    `${facts.capacityKWh} kWh`,
    "LiFePO4",
    `${facts.powerW} W continuous output`,
    `${warrantyYears}-year warranty`,
  ]) {
    if (!description.includes(needle)) {
      throw new Error(`fixture description no longer contains "${needle}"`);
    }
  }
  if (!facts.chemistry.includes("LiFePO4")) throw new Error("chemistry no longer names LiFePO4");
  return facts;
}

function cyclesClaim(n: number): string {
  return `Expected lifetime: ${n} cycles`;
}

function specList(f: FixtureFacts, cycles: number): string {
  return [
    `Capacity: ${f.capacityKWh} kWh`,
    `Chemistry: ${f.chemistry}`,
    `Nominal voltage: ${f.nominalVoltage} V`,
    `Continuous output: ${f.powerW} W`,
    cyclesClaim(cycles),
    `Weight: ${f.weightKg} kg`,
    `Warranty: ${f.warranty}`,
  ]
    .map((s) => `      <li>${s}</li>`)
    .join("\n");
}

/**
 * `upi` defaults to the resolver link for `gtin` (every Study 2 page). Only condition E
 * (follow-up) passes its own host's link; the default keeps A-D byte-identical.
 */
export function renderPage(
  template: Template,
  gtin: string,
  condition: PageCondition,
  upi: string = upiFor(gtin),
): string {
  const f = fixtureFacts();
  const html = readFileSync(join(STIMULUS_DIR, TEMPLATES[template].file), "utf8");
  const cycles = condition === "D" ? D_EXPECTED_CYCLES : f.expectedCycles;
  const out = html
    .replaceAll("{{TITLE}}", f.title)
    .replaceAll("{{DESCRIPTION}}", f.description)
    .replaceAll("{{PRICE}}", PRICE)
    .replaceAll("{{SPECS}}", specList(f, cycles))
    .replaceAll("{{COMPLIANCE}}", f.compliance)
    .replaceAll("{{UPI}}", upi);
  const left = out.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`template ${template} left placeholder ${left[0]} unfilled`);
  return out;
}

export function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface ManifestPage {
  file: string;
  /** "followup": condition E pages (stimulus/build-e.ts), counted only by the follow-up. */
  set: "main" | "pilot" | "followup";
  template: Template;
  condition: PageCondition;
  gtin: string;
  upi: string;
  pageUrl: string;
  sha256: string;
  bytes: number;
}
export interface Manifest {
  _comment: string;
  templates: Record<Template, { file: string; sha256: string; pageUrl: string }>;
  pages: ManifestPage[];
  /** Follow-up: stored passport documents served by fetch_url (condition E). */
  documents?: ManifestDocument[];
  renderedAt: Record<string, string>;
}

export interface ManifestDocument {
  file: string;
  condition: "E";
  gtin: string;
  url: string;
  servedAt: string[];
  contentType: string;
  sha256: string;
  bytes: number;
  derivedFrom: { url: string; file: string; sha256: string; fetchedAt: string | null; transform: string };
}

export function readManifest(): Manifest | null {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest) : null;
}

/** Self-check: pages that must be identical except for named substitutions. */
export function assertOnlyDiffers(a: string, b: string, aSub: string, bSub: string, what: string) {
  const na = a.split(aSub).join("@@X@@");
  const nb = b.split(bSub).join("@@X@@");
  if (na !== nb) throw new Error(`invariant broken: ${what} differ in more than ${aSub} vs ${bSub}`);
}

export function assertNoForbiddenWords(page: string, upi: string, label: string) {
  const stripped = page.split(upi).join("");
  const m = stripped.match(FORBIDDEN);
  if (m) throw new Error(`page ${label} contains forbidden word fragment "${m[0]}"`);
}

function render(set: "main" | "pilot", gtins: Partial<Record<PageCondition, string>>) {
  const pages: ManifestPage[] = [];
  const outDir = join(STIMULUS_DIR, "pages", set);
  const rendered: Array<{ path: string; html: string }> = [];
  for (const t of Object.keys(TEMPLATES) as Template[]) {
    const byCond: Partial<Record<PageCondition, string>> = {};
    for (const [cond, gtin] of Object.entries(gtins) as Array<[PageCondition, string]>) {
      const html = renderPage(t, gtin, cond);
      assertNoForbiddenWords(html, upiFor(gtin), `${t}-${cond}`);
      byCond[cond] = html;
      const path = join(outDir, `${t}-${cond}.html`);
      rendered.push({ path, html });
      pages.push({
        file: relative(STIMULUS_DIR, path).replaceAll("\\", "/"),
        set,
        template: t,
        condition: cond,
        gtin,
        upi: upiFor(gtin),
        pageUrl: TEMPLATES[t].pageUrl,
        sha256: sha256(Buffer.from(html, "utf8")),
        bytes: Buffer.byteLength(html, "utf8"),
      });
    }
    if (set === "main") {
      const f = fixtureFacts();
      for (const c of ["B", "C"] as const) {
        assertOnlyDiffers(byCond.A!, byCond[c]!, gtins.A!, gtins[c]!, `${t} A vs ${c}`);
      }
      if (D_EXPECTED_CYCLES === f.expectedCycles) throw new Error("D claim equals the passport value");
      assertOnlyDiffers(
        byCond.A!,
        byCond.D!,
        cyclesClaim(f.expectedCycles),
        cyclesClaim(D_EXPECTED_CYCLES),
        `${t} A vs D`,
      );
      if (byCond.A!.split(cyclesClaim(f.expectedCycles)).length !== 2)
        throw new Error(`${t}: the expected-lifetime claim must appear exactly once on page A`);
      if (byCond.A === byCond.D) throw new Error("A and D pages are identical");
    }
  }
  mkdirSync(outDir, { recursive: true });
  for (const r of rendered) writeFileSync(r.path, r.html, "utf8");

  const prev = readManifest();
  const templates = Object.fromEntries(
    (Object.keys(TEMPLATES) as Template[]).map((t) => [
      t,
      {
        file: TEMPLATES[t].file,
        sha256: sha256(readFileSync(join(STIMULUS_DIR, TEMPLATES[t].file))),
        pageUrl: TEMPLATES[t].pageUrl,
      },
    ]),
  ) as Manifest["templates"];
  const manifest: Manifest = {
    _comment:
      "Generated by stimulus/render.ts. sha256 is over the exact UTF-8 bytes of each rendered page. Pilot pages (set=pilot) use a throwaway GTIN and are excluded from every analysis (A28 §4).",
    templates,
    pages: [...(prev?.pages ?? []).filter((p) => p.set !== set), ...pages].sort((a, b) =>
      a.file.localeCompare(b.file),
    ),
    ...(prev?.documents ? { documents: prev.documents } : {}),
    renderedAt: { ...(prev?.renderedAt ?? {}), [set]: new Date().toISOString() },
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  for (const p of pages) console.log(`  ${p.file}  ${p.sha256}  ${p.bytes} B  ${p.upi}`);
  console.log(`Wrote ${pages.length} ${set} page(s) and ${relative(REPO, MANIFEST)}`);
}

function fail(msg: string): never {
  console.error(`RENDER REFUSED: ${msg}`);
  process.exit(1);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--pilot")) {
    const i = args.indexOf("--gtin");
    const gtin = i === -1 ? undefined : args[i + 1];
    if (!gtin) fail("--pilot needs --gtin <throwaway GTIN>");
    if (!gtinCheckDigitValid(gtin)) fail(`GTIN ${gtin} has an invalid check digit`);
    render("pilot", { pilot: gtin });
  } else {
    const conditions = JSON.parse(
      readFileSync(process.env.FIXTURES_FILE ?? join(REPO, "fixtures/conditions.json"), "utf8"),
    ) as { assignments: Record<"A" | "B" | "C", { gtin: string | null }> };
    const g: Partial<Record<PageCondition, string>> = {};
    for (const c of ["A", "B", "C"] as const) {
      const gtin = conditions.assignments[c]?.gtin;
      if (!gtin) fail(`fixture ${c} has gtin=null in fixtures/conditions.json. Create the fixtures first.`);
      if (!gtinCheckDigitValid(gtin)) fail(`fixture ${c} GTIN ${gtin} has an invalid check digit`);
      g[c] = gtin;
    }
    if (new Set([g.A, g.B, g.C]).size !== 3) fail("fixture GTINs are not distinct");
    g.D = g.A; // A28 §3: D uses fixture A's product link.
    render("main", g);
  }
}

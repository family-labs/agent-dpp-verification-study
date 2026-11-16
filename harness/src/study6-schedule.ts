/**
 * Study 6's seeded schedule (one shuffle of every model x product x condition x run), shared by the
 * text-page runner (run-study6.ts) and the live runner (run-study6-live.ts).
 */
import type { ModelLabel } from "./study5-models";
import type { ProductKey, S6Cond } from "../../stimulus/study6";

/** The registered seed (A36). */
export const S6_SEED = 20261020;

export interface Item<L extends string = ModelLabel> {
  label: L;
  product: ProductKey;
  condition: S6Cond;
  runIndex: number;
}
function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function buildSchedule<L extends string = ModelLabel>(labels: L[], products: ProductKey[], conds: S6Cond[], runs: number, seed: number): Item<L>[] {
  const out: Item<L>[] = [];
  for (const label of labels) for (const product of products) for (const condition of conds) for (let r = 0; r < runs; r++) out.push({ label, product, condition, runIndex: r });
  const rand = mulberry(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

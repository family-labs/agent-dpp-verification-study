import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import type { Condition } from "./types";

export const UG_API_BASE =
  process.env.UG_API_BASE ?? "https://api.universalgoods.xyz";

const fixturesFile =
  process.env.FIXTURES_FILE ??
  fileURLToPath(new URL("../../fixtures/conditions.json", import.meta.url));

interface Assignment {
  sku: string;
  condition: string;
  groundTruth: "verified" | "unverified" | "invalid";
  productId: string | null;
}

const conditionsRaw = JSON.parse(readFileSync(fixturesFile, "utf8")) as {
  assignments: Record<Condition, Assignment>;
};

export function fixtureFor(condition: Condition): Assignment & { productId: string } {
  const a = conditionsRaw.assignments[condition];
  if (!a?.productId) {
    throw new Error(
      `Fixture ${condition} has no productId — run fixtures/create-fixtures.ts first`,
    );
  }
  return a as Assignment & { productId: string };
}

export const RUNS_PER_CELL = Number(process.env.RUNS_PER_CELL ?? 5);

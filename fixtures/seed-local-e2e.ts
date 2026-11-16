/**
 * Local E2E seed for the DPP verification study — ISOLATED PGlite dir only.
 * Creates a study org + A/B/C fixture products with identical sections,
 * publishes credentials for A and C, corrupts C's signature.
 *
 * Run from apps/server with:
 *   PGLITE_DATA_DIR=<isolated> DATABASE_DRIVER=pglite SIGNING_MASTER_KEY=... \
 *     bun <this file>
 */
import { db } from 'SERVER_ROOT/src/db/client.js';
import { organization } from 'SERVER_ROOT/auth-schema.js';
import { products, entityDetails, sdjwtCredentials } from 'SERVER_ROOT/src/db/schema.js';
import { VerifiableDataService } from 'SERVER_ROOT/src/services/verifiable-data.service.js';
import { and, eq, isNull } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';

const fixturePath = '/Users/REDACTED_USER/Downloads/dpp-verification-study/fixtures/powercell-5000.sections.json';
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const ORG_ID = 'org-dpp-study-local';

// 1. Study org
await db
  .insert(organization)
  .values({
    id: ORG_ID,
    name: 'DPP Study Org (local)',
    slug: 'dpp-study-local',
    createdAt: new Date(),
    profile: null,
  })
  .onConflictDoNothing();

const perUnit: Record<string, { gtin: string; uid: string }> = {
  'PC5K-7301': { gtin: '04012345730106', uid: 'UG-PC5K-7301' },
  'PC5K-4189': { gtin: '04012345418901', uid: 'UG-PC5K-4189' },
  'PC5K-9052': { gtin: '04012345905204', uid: 'UG-PC5K-9052' },
};
const skus: Record<'A' | 'B' | 'C', string> = {
  A: 'PC5K-7301',
  B: 'PC5K-4189',
  C: 'PC5K-9052',
};

const ids: Record<string, string> = {};

for (const [cond, sku] of Object.entries(skus)) {
  // 2. Product
  const [product] = await db
    .insert(products)
    .values({
      organizationId: ORG_ID,
      title: `${fixture.product.title} (${sku})`,
      description: fixture.product.description,
      state: 'active',
    })
    .returning();
  ids[cond] = product.id;

  // 3. Identical sections (identifiers differ per unit, as in production data)
  for (const [slug, section] of Object.entries(fixture.sections) as Array<
    [string, { title: string; data: Record<string, unknown> }]
  >) {
    const data: Record<string, unknown> = { ...section.data };
    if (slug === 'identification') {
      data.uniqueProductIdentifier = perUnit[sku].uid;
      data.globalTradeItemNumber = perUnit[sku].gtin;
    }
    await db.insert(entityDetails).values({
      targetType: 'product',
      targetId: product.id,
      slug,
      title: section.title,
      data,
      typeUri: `ug:dpp/${slug}`,
      visibility: 'public',
    });
  }
  console.log(`[${cond}] ${sku} → ${product.id}`);
}

// 4. Publish credentials for A and C (B stays claimed-only)
for (const cond of ['A', 'C'] as const) {
  const result = await VerifiableDataService.publishCredential(
    'product',
    ids[cond],
    `${fixture.product.title} (${skus[cond]})`,
    ORG_ID,
  );
  console.log(`[${cond}] credential ${result.credentialId} hash ${result.credentialHash}`);
}

// 5. Corrupt C: flip characters in the JWS signature (structure stays valid,
//    signature check fails → the fraudulent condition)
const [credC] = await db
  .select()
  .from(sdjwtCredentials)
  .where(
    and(
      eq(sdjwtCredentials.targetType, 'product'),
      eq(sdjwtCredentials.targetId, ids.C),
      isNull(sdjwtCredentials.revokedAt),
    ),
  );
const [jws, ...disclosures] = credC.credentialJwt.split('~');
const dot = jws.lastIndexOf('.');
const sig = jws.slice(dot + 1);
const tamperedSig = sig.slice(0, -4) + (sig.endsWith('AAAA') ? 'BBBB' : 'AAAA');
const tampered = [jws.slice(0, dot + 1) + tamperedSig, ...disclosures].join('~');
await db
  .update(sdjwtCredentials)
  .set({ credentialJwt: tampered })
  .where(eq(sdjwtCredentials.id, credC.id));
console.log('[C] credential signature corrupted');

writeFileSync(
  '/private/tmp/claude-501/-Users-REDACTED_USER-Downloads-universal-goods-testnet/2cd2b672-91d9-4531-9fae-a031fc141f68/scratchpad/local-fixture-ids.json',
  JSON.stringify(ids, null, 2),
);
console.log('IDs written:', ids);
process.exit(0);

/*
 * NOTE: run this from inside the platform repo's apps/server directory after
 * replacing SERVER_ROOT/ with ../ (module resolution needs the server's
 * node_modules):
 *
 *   sed 's|SERVER_ROOT/|../|g' seed-local-e2e.ts > /path/to/apps/server/scripts/tmp-seed.ts
 *   cd /path/to/apps/server
 *   PGLITE_DATA_DIR=/tmp/pglite-dpp DATABASE_DRIVER=pglite \
 *     SIGNING_MASTER_KEY=$(openssl rand -hex 32) TEST_BYPASS_AUTH=1 \
 *     bun scripts/local-migrate.ts && bun scripts/tmp-seed.ts
 *
 * Then start the server against the same env (PORT=4062) and point the
 * harness at UG_API_BASE=http://localhost:4062.
 * Local expectation: A → valid_unanchored (verified requires the testnet
 * on-chain anchor), B → unverified, C → invalid.
 */

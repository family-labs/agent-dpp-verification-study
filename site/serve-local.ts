/**
 * Local PREVIEW of the two sites (never used for trials): http://oskvale.localhost:8790 and
 * http://oskvale-store.localhost:8790, served by the real Worker code over the built bundle with an
 * in-memory log. For preview only, absolute links to the two hosts are rewritten to the local
 * addresses so the pages can be clicked through; the bundle itself is never changed.
 * Run from harness/:  bun run ../site/serve-local.ts [phase]   (phase: closed | check | W | D0 | D1; default D1)
 */
import { localEnv } from "./local-env";

const { handle } = await import("./worker");
const PORT = Number(process.env.PORT ?? 8790);
const KEY = crypto.randomUUID();
const env = localEnv(KEY);
const ctx = { waitUntil: (p: Promise<unknown>) => void p };
const phase = process.argv[2] ?? "D1";
await handle(new Request("https://oskvale.com/__s6/phase", { method: "PUT", headers: { Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ phase, note: "local preview" }) }), env, ctx);

const LOCAL: Record<string, string> = { "oskvale.localhost": "oskvale.com", "oskvale-store.localhost": "oskvale-store.com" };
const toLocal = (s: string) => s.replaceAll("https://oskvale-store.com", `http://oskvale-store.localhost:${PORT}`).replaceAll("https://oskvale.com", `http://oskvale.localhost:${PORT}`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const u = new URL(req.url);
    const host = LOCAL[u.hostname] ?? "oskvale.com";
    const r = await handle(new Request(`https://${host}${u.pathname}${u.search}`, { method: req.method, headers: req.headers }), env, ctx);
    const ct = r.headers.get("Content-Type") ?? "";
    if (!ct.startsWith("text/html") || !r.body) return r;
    return new Response(toLocal(await r.text()), { status: r.status, headers: r.headers });
  },
});
console.log(`preview (phase ${phase}): http://oskvale.localhost:${PORT}/  and  http://oskvale-store.localhost:${PORT}/`);

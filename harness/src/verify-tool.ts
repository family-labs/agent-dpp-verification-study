/**
 * Study 8: the open verify tool (`@universal-goods/verify`, family-labs/universal-goods-protocol) offered
 * to the models exactly as an MCP client sees it. The real MCP server runs in memory; `tools/list` gives
 * the definition the model gets (name, description, JSON input schema, unchanged); a model's call goes
 * through `tools/call`, and the model receives the server's text content unchanged.
 *
 * The package is a pinned, built snapshot of the protocol repo (`git archive <commit>`, then
 * `bun install --linker hoisted --backend copyfile` and `bun run build`) in UGP_VERIFY_DIR. Every run
 * records the commit and the sha256 of the package's built files.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const UGP_VERIFY_COMMIT = process.env.UGP_VERIFY_COMMIT ?? "dc97cc6";
export const UGP_VERIFY_DIR = process.env.UGP_VERIFY_DIR ?? `C:/Users/REDACTED_USER/Downloads/ugp-verify-${UGP_VERIFY_COMMIT}`;

export interface ExtraToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface ExtraToolCall {
  name: string;
  args: unknown;
  /** The verify status from the server's structured result, or null when the call failed. */
  status: string | null;
  output: string;
  ms: number;
}
/** A client-side tool the harness runs for the model, beside the vendor's own web tools. */
export interface ExtraTool {
  spec: ExtraToolSpec;
  call(args: unknown): Promise<string>;
  log: ExtraToolCall[];
}

/** sha256 over the package's built files (dist/*.js, sorted by name): what actually ran. */
export function verifyDistSha(): string {
  const dist = join(UGP_VERIFY_DIR, "packages/verify/dist");
  if (!existsSync(dist)) throw new Error(`verify package not built in ${UGP_VERIFY_DIR}`);
  const h = createHash("sha256");
  for (const f of readdirSync(dist).filter((n) => n.endsWith(".js")).sort()) h.update(f).update(readFileSync(join(dist, f)));
  return h.digest("hex");
}

type McpText = { type: string; text?: string };
/** One fresh MCP server + client per trial, so each trial's call log is its own. */
export async function createVerifyTool(): Promise<ExtraTool> {
  const mod = (p: string) => import(pathToFileURL(join(UGP_VERIFY_DIR, p)).href);
  const { createServer, TOOL_NAME } = await mod("packages/verify/dist/mcp-server.js");
  const { Client } = await mod("node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
  const { InMemoryTransport } = await mod("node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js");
  const server = createServer({});
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "study8-harness", version: "1.0.0" });
  await client.connect(clientSide);
  const { tools } = (await client.listTools()) as { tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }> };
  const t = tools.find((x) => x.name === TOOL_NAME);
  if (!t) throw new Error(`the MCP server lists no ${TOOL_NAME}`);
  const log: ExtraToolCall[] = [];
  return {
    spec: { name: t.name, description: t.description ?? "", parameters: t.inputSchema },
    log,
    async call(args: unknown) {
      const started = Date.now();
      try {
        const r = (await client.callTool({ name: t.name, arguments: (args ?? {}) as Record<string, unknown> })) as { content?: McpText[]; structuredContent?: { status?: string }; isError?: boolean };
        const output = (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
        log.push({ name: t.name, args, status: r.isError ? null : (r.structuredContent?.status ?? null), output, ms: Date.now() - started });
        return output;
      } catch (e) {
        const output = `The tool failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
        log.push({ name: t.name, args, status: null, output, ms: Date.now() - started });
        return output;
      }
    },
  };
}

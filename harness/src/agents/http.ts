/**
 * POST JSON to a model API with a bounded retry on 429 / 5xx / network errors.
 *
 * Error messages carry the vendor's response body but NEVER the request URL or
 * headers, so an API key cannot reach a log through an error string.
 */
export async function postJsonWithRetry(
  vendor: string,
  url: string,
  body: unknown,
  headers: Record<string, string>,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<unknown> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  let lastErr = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      lastErr = `${vendor} network error: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    if (res.ok) return res.json();
    const text = (await res.text()).slice(0, 2000);
    lastErr = `${vendor} ${res.status}: ${text}`;
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(lastErr);
}

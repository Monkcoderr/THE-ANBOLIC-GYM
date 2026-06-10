/**
 * Shared SWR fetcher. Unwraps the { success, data } envelope and throws
 * on error so SWR can surface it.
 */
export async function fetcher(url) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    const err = new Error(json.error || "Request failed");
    err.code = json.code;
    err.status = res.status;
    throw err;
  }
  return json.data;
}

import fetch, { RequestInit } from "node-fetch";

export async function customFetch<T>(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = options.timeout ?? 7000;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal as any,
    });

    const contentType = response.headers.get("content-type");

    // Read body as text first so we can handle empty or invalid JSON gracefully
    const text = await response.text();
    let data: any;
    if (contentType?.includes("application/json")) {
      if (!text || text.trim() === "") {
        // empty JSON body (204/no-content or server returned empty)
        data = null;
      } else {
        try {
          data = JSON.parse(text);
        } catch (err) {
          // include a short snippet to aid debugging
          const snippet = text.slice(0, 200);
          throw new Error(`Invalid JSON response: ${snippet}`);
        }
      }
    } else {
      data = text;
    }

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} - ${JSON.stringify(data)}`);
    }

    return data as T;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Timeout`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

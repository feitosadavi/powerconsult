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
    const data = contentType?.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} - ${data}`);
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

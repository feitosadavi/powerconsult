export async function customFetch<T = any>(
  url: string,
  options: RequestInit
): Promise<T> {
  console.log({ url });

  const response = await fetch(url, options);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Request failed: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data;
}

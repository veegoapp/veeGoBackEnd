const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const API_BASE = `${BASE}/api`;

export async function adminFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("accessToken");
  const fullUrl = `${API_BASE}${path}`;
  const method = options.method ?? "GET";

  console.group(`[adminFetch] ${method} ${fullUrl}`);
  console.log("Full URL:", fullUrl);
  console.log("Method:", method);
  if (options.body) {
    try { console.log("Body:", JSON.parse(options.body as string)); }
    catch { console.log("Body (raw):", options.body); }
  }

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  console.log("Response status:", res.status);
  const raw = await res.clone().text();
  console.log("Response body (first 500 chars):", raw.slice(0, 500));
  console.groupEnd();

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

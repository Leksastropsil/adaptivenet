import { LK21Constants } from "../models/types";

// Constant headers to avoid reallocation
const DEFAULT_HEADERS = Object.freeze({
  "User-Agent": LK21Constants.USER_AGENT,
});

export async function fetchHtml(
  url: string,
  params?: Record<string, string>,
): Promise<string> {
  const fetchUrl = params ? `${url}?${new URLSearchParams(params)}` : url;
  const res = await fetch(fetchUrl, {
    headers: DEFAULT_HEADERS,
    // method: "GET" // Default
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.text();
}

export async function postForm(
  url: string,
  data: Record<string, string>,
  headers: Record<string, string>,
): Promise<any> {
  const formData = new URLSearchParams();
  for (const key in data) {
    formData.append(key, data[key]);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "User-Agent": LK21Constants.USER_AGENT,
    },
    body: formData,
  });

  if (!res.ok) throw new Error(`Post failed: ${res.status}`);
  return res.json();
}

import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import app from "../api/index";

// Constants
const ADMIN_SECRET = "test_secret";
const MOCK_TUNNEL = "https://tunnel.mock.com";

// Mock Bindings
const mockKV = {
  get: mock(async () => MOCK_TUNNEL),
  put: mock(async () => {}),
};

const mockEnv = {
  LK21_STORE: mockKV as unknown as KVNamespace,
  ADMIN_SECRET: ADMIN_SECRET,
  USER_AGENT: "Mozilla/5.0 (Test Browser)",
};

// Start Mocking Global Fetch
const originalFetch = globalThis.fetch;

describe("LK21 API Unit Tests", () => {
  beforeEach(() => {
    // Reset mocks
    mockKV.get.mockClear();
    mockKV.put.mockClear();
    // Reset fetch mock default
    globalThis.fetch = mock(async () => new Response("OK")) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // 1. REGISTER Endpoint
  // -------------------------------------------------------------------------

  it("POST /register - Should register tunnel with correct secret", async () => {
    const req = new Request("http://localhost/register", {
      method: "POST",
      body: JSON.stringify({
        tunnelUrl: "https://new-tunnel.com",
        secret: ADMIN_SECRET,
      }),
    });
    const res = await app.fetch(req, mockEnv);
    const data: any = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe("Registered");
    expect(mockKV.put).toHaveBeenCalledWith(
      "CURRENT_TUNNEL",
      "https://new-tunnel.com",
    );
  });

  it("POST /register - Should reject incorrect secret", async () => {
    const req = new Request("http://localhost/register", {
      method: "POST",
      body: JSON.stringify({ tunnelUrl: "https://bad.com", secret: "wrong" }),
    });
    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 2. PUBLIC Endpoints (KV Check)
  // -------------------------------------------------------------------------

  it("GET /movies - Should fail if KV is empty", async () => {
    // Mock KV returning null
    mockKV.get.mockResolvedValueOnce(null as any);

    const req = new Request("http://localhost/movies");
    const res = await app.fetch(req, mockEnv);
    const data: any = await res.json();

    expect(res.status).toBe(500);
    expect(data.detail).toContain("Server sedang offline");
  });

  // -------------------------------------------------------------------------
  // 3. LOGIC Endpoints (Mocking Fetch)
  // -------------------------------------------------------------------------

  it("GET /movies - Should Scrape Catalog correctly", async () => {
    // Mock HTML response from LK21
    const mockHtml = `
            <html>
                <head><title>LK21 Official</title></head>
                <body>
                    <div class="gallery-grid">
                        <article>
                            <div class="poster-title">Test Movie</div>
                            <a href="/movie-slug">Link</a>
                            <div class="label">HDRip</div>
                            <img src="poster.jpg" />
                            <span itemprop="ratingValue">9.9</span>
                        </article>
                    </div>
                </body>
            </html>
        `;

    globalThis.fetch = mock(async (url: any) => {
      if (url.toString().includes("target=")) {
        return new Response(mockHtml);
      }
      return new Response("Err", { status: 404 });
    }) as any;

    const req = new Request("http://localhost/movies");
    const res = await app.fetch(req, mockEnv);
    const data: any = await res.json();

    expect(res.status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].title).toBe("Test Movie");
    expect(data[0].slug).toBe("movie-slug");
  });

  it("GET /watch/:slug - Should Extract & Deep Fetch Stream", async () => {
    // Step 1: Mock Movie Page HTML (returns Iframe URL)
    const moviePageHtml = `
            <html>
                <title>Movie Title</title>
                <div class="g-item"> <img src="poster.jpg"/> </div>
                <div id="player-list">
                    <li><a href="https://playeriframe.sbs/iframe/p2p/TEST_ID?foo=bar">Stream 1</a></li>
                </div>
            </html>
        `;

    // Step 2: Mock API Response (Deep Fetch)
    const apiResponseJson = JSON.stringify({
      data: {
        sources: [{ file: "https://stream.m3u8", label: "Auto" }],
      },
    });

    // Smart Mock
    globalThis.fetch = mock(async (urlInput: any) => {
      const urlStr = urlInput.toString();
      const urlObj = new URL(urlStr);
      const target = urlObj.searchParams.get("target");

      if (!target) return new Response("No target param", { status: 400 });

      // 1. Fetch Movie Page
      if (target === "https://tv7.lk21official.cc/avengers") {
        return new Response(moviePageHtml);
      }

      // 2. Deep Fetch API (Check ID Extraction)
      // Expect ID to be "TEST_ID" (Sanitized)
      // Target: https://cloud.hownetwork.xyz/api2.php?id=TEST_ID
      if (target.includes("api2.php") && target.includes("id=TEST_ID")) {
        return new Response(apiResponseJson);
      }

      return new Response(`Mock Not Found: ${target}`, { status: 404 });
    }) as any;

    const req = new Request("http://localhost/watch/avengers");
    const res = await app.fetch(req, mockEnv);
    const data: any = await res.json();

    expect(res.status).toBe(200);
    expect(data.title).toBe("Movie Title");
    expect(data.poster).toBe("poster.jpg");
    expect(data.data.data.sources[0].file).toBe("https://stream.m3u8");
  });
});

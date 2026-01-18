import { CoreEngine } from "../../core/engine";
import { IAdapter, MovieCard, MovieDetail } from "../../core/types";
import * as crypto from "crypto";
import * as cheerio from "cheerio"; // Basic parsing if needed

const MXM_BASE_URL = "https://www.musixmatch.com/ws/1.1";

export class MusixmatchAdapter implements IAdapter {
  private engine: CoreEngine;
  private secret: string | null = null;

  constructor(engine: CoreEngine) {
    this.engine = engine;
  }

  getName(): string {
    return "Musixmatch";
  }

  /**
   * Ported from Python: get_secret
   * Fetches latest app JS and decodes the secret key.
   */
  private async getSecret(): Promise<string> {
    if (this.secret) return this.secret;

    // 1. Get Homepage to find script
    const homeHtml = await this.engine.fetchHtml(
      "https://www.musixmatch.com/search",
      {},
      {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        Cookie: "mxm_bab=AB",
      },
    );

    // Regex for _app url
    const pattern =
      /src="([^"]*\/_next\/static\/chunks\/pages\/_app-[^"]+\.js)"/g;
    let match;
    let latestAppUrl = "";

    // equivalent to re.findall, take last match
    while ((match = pattern.exec(homeHtml)) !== null) {
      latestAppUrl = match[1];
    }

    if (!latestAppUrl) throw new Error("_app URL not found");
    if (!latestAppUrl.startsWith("http"))
      latestAppUrl = `https://www.musixmatch.com${latestAppUrl}`;

    // 2. Fetch JS
    const jsCode = await this.engine.fetchHtml(latestAppUrl);

    // 3. Extract Secret
    // Python: r'from\(\s*"(.*?)"\s*\.split'
    const secretPattern = /from\(\s*"(.*?)"\s*\.split/;
    const secretMatch = jsCode.match(secretPattern);

    if (!secretMatch) throw new Error("Encoded string not found in JS");

    const encoded = secretMatch[1];
    // Reverse
    const reversed = encoded.split("").reverse().join("");
    // Base64 Decode
    const decoded = Buffer.from(reversed, "base64").toString("utf-8");

    this.secret = decoded;
    return decoded;
  }

  /**
   * Ported from Python: generate_signature
   */
  private generateSignature(url: string, secret: string): string {
    const current = new Date();
    const l = current.getFullYear().toString();
    const s = (current.getMonth() + 1).toString().padStart(2, "0");
    const r = current.getDate().toString().padStart(2, "0");

    const message = url + l + s + r;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(message);
    const hash = hmac.digest("base64");

    return encodeURIComponent(hash);
  }

  private async request(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<any> {
    const secret = await this.getSecret();

    // Construct Query
    const query = new URLSearchParams({
      app_id: "web-desktop-app-v1.0",
      format: "json",
    });

    for (const [k, v] of Object.entries(params)) {
      query.append(k, v);
    }

    // Path + Query
    const pathAndQuery = `${endpoint}?${query.toString()}`;
    const fullUrlForSig = `${MXM_BASE_URL}/${pathAndQuery}`;

    const signature = this.generateSignature(fullUrlForSig, secret);

    // Final URL
    const finalUrl = `${fullUrlForSig}&signature=${signature}&signature_protocol=sha256`;

    const res = await this.engine.fetch(finalUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        Cookie: "mxm_bab=AB",
      },
    });

    if (!res.ok) throw new Error(`MXM Error ${res.status}`);
    return await res.json();
  }

  async getLatest(page: number): Promise<MovieCard[]> {
    if (page > 1) return [];

    // Chart: Top Tracks
    const data = await this.request("chart.tracks.get", {
      page_size: "20",
      country: "US", // Default
      page: String(page),
    });

    const results: MovieCard[] = [];
    const list = data.message?.body?.track_list || [];

    for (const item of list) {
      const t = item.track;
      results.push({
        title: t.track_name,
        slug: String(t.track_id),
        poster:
          t.album_coverart_800x800 ||
          t.album_coverart_500x500 ||
          t.album_coverart_350x350 ||
          null,
        rating: String(t.track_rating),
        quality: t.artist_name, // Abuse quality field for Artist
        url: t.track_share_url,
      });
    }

    return results;
  }

  async search(query: string): Promise<MovieCard[]> {
    const data = await this.request("track.search", {
      q: query,
      f_has_lyrics: "true",
      page_size: "20",
      page: "1",
    });

    const results: MovieCard[] = [];
    const list = data.message?.body?.track_list || [];

    for (const item of list) {
      const t = item.track;
      results.push({
        title: t.track_name,
        slug: String(t.track_id),
        poster: t.album_coverart_500x500 || null,
        rating: null,
        quality: t.artist_name,
        url: t.track_share_url,
      });
    }

    return results;
  }

  async getStream(slug: string): Promise<MovieDetail> {
    // 1. Get Track Info (for Metadata)
    const trackData = await this.request("track.get", { track_id: slug });
    const t = trackData.message?.body?.track;

    // 2. Get Lyrics
    const lyricData = await this.request("track.lyrics.get", {
      track_id: slug,
    });
    const l = lyricData.message?.body?.lyrics;

    const lyricsBody = l ? l.lyrics_body : "No lyrics found.";

    return {
      title: t ? t.track_name : "Unknown Track",
      slug,
      poster: t ? t.album_coverart_800x800 || t.album_coverart_500x500 : null,
      synopsis: `ARTIST: ${t?.artist_name}\nALBUM: ${t?.album_name}\n\n${lyricsBody}`,
      streams: [
        {
          label: "Musixmatch Page",
          type: "url",
          url: t?.track_share_url || `https://www.musixmatch.com/track/${slug}`,
        },
      ],
    };
  }
}

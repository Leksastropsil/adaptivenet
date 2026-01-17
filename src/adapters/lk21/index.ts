import * as cheerio from "cheerio";
import { CoreEngine } from "../../core/engine";
import { IAdapter, MovieCard, MovieDetail, StreamItem } from "../../core/types";

// Config Constants (internal to this adapter)
const BASE_URL = "https://tv7.lk21official.cc";
const PLAYER_HOST = "playeriframe.sbs";
const CLOUD_HOST = "cloud.hownetwork.xyz";

export class LK21Adapter implements IAdapter {
  private engine: CoreEngine;

  constructor(engine: CoreEngine) {
    this.engine = engine;
  }

  getName(): string {
    return "LK21";
  }

  async getLatest(page: number): Promise<MovieCard[]> {
    const category = "top-movie-today";
    const url =
      page > 1
        ? `${BASE_URL}/${category}/page/${page}`
        : `${BASE_URL}/${category}`;

    const html = await this.engine.fetchHtml(url);
    const $ = cheerio.load(html);
    const results: MovieCard[] = [];

    $(".gallery-grid article").each((_, el) => {
      const $el = $(el);
      const title = $el.find(".poster-title").text().trim();
      const href = $el.find("a").first().attr("href") || "";

      if (title && href) {
        results.push({
          title,
          slug: href.replace(/\/$/, "").split("/").pop() || "",
          poster: $el.find("img").attr("src") || null,
          rating: $el.find('[itemprop="ratingValue"]').text().trim() || null,
          quality: $el.find(".label").text().trim() || null,
          url: href.startsWith("http") ? href : `${BASE_URL}/${href}`,
        });
      }
    });
    return results;
  }

  async search(query: string): Promise<MovieCard[]> {
    const url = `${BASE_URL}/search`;
    const html = await this.engine.fetchHtml(url, { s: query });
    const $ = cheerio.load(html);
    const results: MovieCard[] = [];

    // Fallback selectors
    let items = $(".search-item article");
    if (!items.length) items = $("article.post");

    items.each((_, el) => {
      const $el = $(el);
      const link = $el.find("h2 a").first().length
        ? $el.find("h2 a").first()
        : $el.find(".entry-title a").first();

      if (link.length) {
        const title = link.text().trim();
        const href = link.attr("href") || "";
        results.push({
          title,
          slug: href.replace(/\/$/, "").split("/").pop() || "",
          poster: $el.find("img").attr("src") || null,
          rating: null,
          quality: null, // Search results usually don't show quality
          url: href,
        });
      }
    });

    return results;
  }

  async getStream(slug: string): Promise<MovieDetail> {
    const pageUrl = `${BASE_URL}/${slug}`;
    const headers = { Referer: BASE_URL };

    // 1. Get Page
    const html = await this.engine.fetchHtml(pageUrl, {}, headers);
    const $ = cheerio.load(html);

    const title = $("title").text().split("|")[0].trim();
    const poster = $(".g-item").first().find("img").attr("src") || null;
    const synopsis = $(".entry-content p").first().text().trim() || null;

    // 2. Find Iframe (P2P)
    let iframeSrc: string | null = null;
    $("#player-list li a").each((_, el) => {
      const href = $(el).attr("data-url") || $(el).attr("href");
      if (href?.includes(PLAYER_HOST)) {
        iframeSrc = href;
        return false;
      }
    });
    if (!iframeSrc) {
      const src = $("iframe#main-player").attr("src");
      if (src?.includes(PLAYER_HOST)) iframeSrc = src;
    }

    if (!iframeSrc) throw new Error("Stream source (P2P) not found");

    // 3. Extract ID
    let fileId: string | null = null;
    const regexP2P = /\/p2p\/([^?&]+)/;
    const regexId = /[?&]id=([^?&]+)/;

    const matchP2P = iframeSrc.match(regexP2P);
    if (matchP2P) fileId = matchP2P[1];
    else {
      const matchId = iframeSrc.match(regexId);
      if (matchId) fileId = matchId[1];
    }

    if (!fileId) throw new Error("Could not extract ID");
    fileId = fileId.split("?")[0].split("&")[0];

    // 4. Deep Fetch (Cloud Hownetwork)
    const apiUrl = `https://${CLOUD_HOST}/api2.php`;
    const deepRaw = await this.engine.fetchHtml(
      apiUrl,
      { id: fileId },
      {
        Referer: pageUrl,
        Origin: `https://${CLOUD_HOST}`,
        "X-Requested-With": "XMLHttpRequest",
      },
    );

    let streamUrl = "";
    try {
      const data = JSON.parse(deepRaw);
      if (data.file) streamUrl = data.file;
      else if (data.sources?.[0]?.file) streamUrl = data.sources[0].file;
      else throw new Error("No file in JSON");
    } catch {
      throw new Error("Invalid JSON from Deep Fetch");
    }

    return {
      title,
      slug,
      poster,
      synopsis,
      streams: [
        {
          label: "Auto",
          type: "hls",
          url: streamUrl,
          headers: { Referer: `https://${CLOUD_HOST}/` },
        },
      ],
    };
  }
}

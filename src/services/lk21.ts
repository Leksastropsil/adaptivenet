import * as cheerio from "cheerio";
import {
  FilterResponse,
  MovieResult,
  WatchResponse,
  StreamItem,
  LK21Config, // Updated import
} from "../models/types";
import { fetchHtml, postForm } from "../utils/http";

export async function getFilters(config: LK21Config): Promise<FilterResponse> {
  const html = await fetchHtml(
    config.BASE_URL,
    {},
    { Referer: config.BASE_URL },
  );
  const $ = cheerio.load(html);

  const extract = (
    selector: string,
    prefix: string = "",
  ): { title: string; parameter: string }[] => {
    const results: { title: string; parameter: string }[] = [];
    $(selector)
      .find("option")
      .each((_, el) => {
        const val = $(el).attr("value");
        const txt = $(el).text().trim();
        if (val && val !== "0" && txt) {
          results.push({
            title: txt,
            parameter: prefix ? `${prefix}/${val}` : val.replace(/^\//, ""),
          });
        }
      });
    return results;
  };

  return {
    genres: extract('select[name="genre1"]', "genre"),
    countries: extract('select[name="country"]', "country"),
    years: extract('select[name="tahun"]', "year"),
    orders: extract("select.orderby"),
  };
}

export async function scrapeCatalog(
  config: LK21Config,
  page: number = 1,
  category: string = "top-movie-today",
): Promise<MovieResult[]> {
  const url =
    page > 1
      ? `${config.BASE_URL}/${category}/page/${page}`
      : `${config.BASE_URL}/${category}`;

  // Fail safe for empty pages (Rust/Python do this implicity or explicitly)
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: MovieResult[] = [];

    $(".gallery-grid article").each((_, el) => {
      const $el = $(el);
      const titleEl = $el.find(".poster-title");
      const linkEl = $el.find("a").first();

      if (!titleEl.length || !linkEl.length) return;

      const title = titleEl.text().trim();
      const href = linkEl.attr("href") || "";
      const slug = href.replace(/\/$/, "").split("/").pop() || "";
      const poster = $el.find("img").attr("src") || null;
      const rating = $el.find('[itemprop="ratingValue"]').text().trim() || null;
      const quality = $el.find(".label").text().trim() || null;

      results.push({
        title,
        slug,
        poster,
        rating,
        quality,
        url: href.startsWith("http") ? href : `${config.BASE_URL}/${href}`,
      });
    });

    return results;
  } catch {
    return [];
  }
}

export async function searchMovies(
  config: LK21Config,
  query: string,
): Promise<MovieResult[]> {
  const url = `${config.BASE_URL}/search`;
  try {
    const html = await fetchHtml(
      url,
      { s: query },
      { Referer: config.BASE_URL },
    );
    const $ = cheerio.load(html);
    const results: MovieResult[] = [];

    // Try .search-item article first, fallback to article.post (matches Rust logic)
    let items = $(".search-item article");
    if (items.length === 0) {
      items = $("article.post");
    }

    items.each((_, el) => {
      const $el = $(el);
      const linkEl = $el.find("h2 a").first().length
        ? $el.find("h2 a").first()
        : $el.find(".entry-title a").first();

      if (linkEl.length) {
        const title = linkEl.text().trim();
        const href = linkEl.attr("href") || "";
        const slug = href.replace(/\/$/, "").split("/").pop() || "";
        const poster = $el.find("img").attr("src") || null;

        results.push({
          title,
          slug,
          poster,
          rating: null,
          quality: null,
          url: href,
        });
      }
    });

    return results;
  } catch {
    return [];
  }
}

export async function extractStream(
  config: LK21Config,
  slug: string,
): Promise<WatchResponse> {
  const pageUrl = `${config.BASE_URL}/${slug}`;
  const html = await fetchHtml(pageUrl, {}, { Referer: config.BASE_URL });
  const $ = cheerio.load(html);

  const title = $("title").text().split("|")[0].trim();

  let targetIframeUrl: string | null = null;

  // Priority 1: Player list p2p
  $("#player-list li a").each((_, el) => {
    const href = $(el).attr("data-url") || $(el).attr("href");
    if (
      href &&
      href.includes(config.PLAYER_IFRAME_HOST) &&
      href.includes("p2p")
    ) {
      targetIframeUrl = href;
      return false; // break
    }
  });

  // Priority 2: Main player iframe
  if (!targetIframeUrl) {
    const src = $("iframe#main-player").attr("src");
    if (src && src.includes(config.PLAYER_IFRAME_HOST)) {
      targetIframeUrl = src;
    }
  }

  if (!targetIframeUrl) {
    throw new Error("Server P2P not found");
  }

  // Extract hash
  // targetIframeUrl might be "https://playeriframe.sbs/..."
  const hash = targetIframeUrl.split("/").pop();
  if (!hash) throw new Error("Could not extract hash ID");

  // Post to API
  const apiUrl = `https://${config.CLOUD_HOST}/api2.php?id=${hash}`;
  const headers = {
    Referer: `https://${config.CLOUD_HOST}/video.php?id=${hash}`,
    Origin: `https://${config.CLOUD_HOST}`,
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  };
  const body = {
    r: `https://${config.PLAYER_IFRAME_HOST}/`,
    d: config.CLOUD_HOST,
  };

  const data = await postForm(apiUrl, body, headers);

  const streams: StreamItem[] = [];

  const parse = (item: any) => {
    if (item && item.file) {
      streams.push({
        label: item.label || "Auto",
        type: "hls",
        url: item.file,
      });
    }
  };

  if (Array.isArray(data)) {
    data.forEach(parse);
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.sources)) {
      data.sources.forEach(parse);
    } else {
      parse(data);
    }
  }

  if (streams.length === 0) {
    throw new Error("Stream empty");
  }

  return {
    title,
    slug,
    streams,
  };
}

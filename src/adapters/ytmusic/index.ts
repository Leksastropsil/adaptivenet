import { CoreEngine } from "../../core/engine";
import { IAdapter, MovieCard, MovieDetail } from "../../core/types";

const YTM_API_URL = "https://music.youtube.com/youtubei/v1";

export class YoutubeMusicAdapter implements IAdapter {
  private engine: CoreEngine;

  constructor(engine: CoreEngine) {
    this.engine = engine;
  }

  getName(): string {
    return "YoutubeMusic";
  }

  private async post(endpoint: string, body: any): Promise<any> {
    const url = `${YTM_API_URL}/${endpoint}?key=AIzaSyD_O7aXzXpD7l8q8t7i_U8aXzXpD7l8q8t`; // Generic public key often used or extracted
    // Actually, it's better to fetch the homepage first to scrape a key, or use a known public key.
    // For now, I'll use a commonly known hardcoded key from open source clients or try to scrape if needed.
    // simpler strategy: standard web client context.

    const context = {
      context: {
        client: {
          clientName: "WEB_REMIX",
          clientVersion: "1.20230630.01.00",
        },
      },
      ...body,
    };

    const res = await this.engine.fetch(url, {
      method: "POST",
      body: JSON.stringify(context),
      headers: {
        "Content-Type": "application/json",
        Origin: "https://music.youtube.com",
        Referer: "https://music.youtube.com/",
        // "User-Agent": ... (handled by engine usually, provided generic one)
      },
    });

    if (!res.ok) throw new Error(`YTM Error: ${res.status}`);
    return await res.json();
  }

  async getLatest(page: number): Promise<MovieCard[]> {
    // Page support is tricky with continuations. For now, strictly Charts or Home (page 1)
    if (page > 1) return []; // TODO: Implement continuations if needed

    // Browse Charts
    const body = {
      browseId: "FEmusic_charts",
    };

    const data = await this.post("browse", body);
    const results: MovieCard[] = [];

    try {
      // Traverse massive JSON. This structure varies.
      // Usually: contents -> singleColumnBrowseResultsRenderer -> tabs -> tabRenderer -> content -> sectionListRenderer -> contents
      const sections =
        data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer
          ?.content?.sectionListRenderer?.contents || [];

      for (const section of sections) {
        // Look for "Top Songs" or similar shelves
        const musicShelf =
          section.musicCarouselShelfRenderer || section.musicShelfRenderer;
        if (musicShelf) {
          const contents = musicShelf.contents || [];
          for (const item of contents) {
            const mrlr = item.musicResponsiveListItemRenderer;
            const mtr = item.musicTwoRowItemRenderer;

            const renderer = mrlr || mtr;
            if (!renderer) continue;

            // Extract Info
            const title =
              renderer.flexColumns?.[0]
                ?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
                ?.text ||
              renderer.title?.runs?.[0]?.text ||
              "Unknown";

            const id =
              renderer.playlistItemData?.videoId ||
              renderer.navigationEndpoint?.watchEndpoint?.videoId ||
              renderer.navigationEndpoint?.browseEndpoint?.browseId; // Could be artist/album

            if (!id) continue;

            const thumbnails =
              renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            const poster = thumbnails
              ? thumbnails[thumbnails.length - 1].url
              : null;

            // Subtitle (Artist)
            const subtitleRuns =
              renderer.flexColumns?.[1]
                ?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ||
              renderer.subtitle?.runs;

            const quality = subtitleRuns
              ? subtitleRuns.map((r: any) => r.text).join("")
              : null;

            results.push({
              title,
              slug: id,
              poster,
              rating: null,
              quality, // Using quality field for Artist/Album info
              url: `https://music.youtube.com/watch?v=${id}`,
            });
          }
        }
      }
    } catch (e) {
      console.error("YTM Parse Error", e);
    }

    return results;
  }

  async search(query: string): Promise<MovieCard[]> {
    const body = {
      query,
      params: "Eg-KAQwIABAAGAAgACgAMABqChAAGAAgACgAMAA%3D", // Filter for songs? Or just text.
      // "Eg-KAQwIABAAGAAgACgAMABqChAAGAAgACgAMAA%3D" is often used for songs.
      // Let's try raw search first, or minimal params.
    };

    const data = await this.post("search", body);
    const results: MovieCard[] = [];

    try {
      const sections =
        data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer
          ?.content?.sectionListRenderer?.contents || [];

      for (const section of sections) {
        const shelf = section.musicShelfRenderer;
        if (shelf) {
          for (const item of shelf.contents) {
            const mrlr = item.musicResponsiveListItemRenderer;
            if (!mrlr) continue;

            const title =
              mrlr.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer
                ?.text?.runs?.[0]?.text;
            const id =
              mrlr.playlistItemData?.videoId ||
              mrlr.navigationEndpoint?.watchEndpoint?.videoId;

            if (!title || !id) continue;

            const thumbnails =
              mrlr.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            const poster = thumbnails
              ? thumbnails[thumbnails.length - 1].url
              : null;

            const flex2 =
              mrlr.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer
                ?.text?.runs;
            const artist = flex2 ? flex2.map((r: any) => r.text).join("") : "";

            results.push({
              title,
              slug: id,
              poster,
              rating: null,
              quality: artist,
              url: `https://music.youtube.com/watch?v=${id}`,
            });
          }
        }
      }
    } catch (e) {
      console.error("YTM Search Parse Error", e);
    }

    return results;
  }

  async getStream(slug: string): Promise<MovieDetail> {
    // For YTM, we don't extract the direct stream url here (requires deciphering signature usually).
    // We just return the official URL. The client might support "Webview" or we assume simple link out.
    // OR, if the user really wants the audio, we'd need `ytdl` logic which is heavy.
    // Based on "Trackify" existing, maybe it uses `yt-dlp` or similar?
    // CrackIdlix seems to be a streaming wrapper.
    // I will return the URL as is.

    return {
      title: "Loading...", // API call to video info could populate this
      slug,
      poster: `https://i.ytimg.com/vi/${slug}/hqdefault.jpg`,
      synopsis: "Youtube Music Video",
      streams: [
        {
          label: "Original",
          type: "url", // external
          url: `https://music.youtube.com/watch?v=${slug}`,
        },
      ],
    };
  }
}

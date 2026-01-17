export interface MovieCard {
  title: string;
  slug: string;
  poster: string | null;
  rating: string | null;
  quality: string | null;
  url: string;
}

export interface StreamItem {
  label: string;
  type: string;
  url: string;
  headers?: Record<string, string>;
}

export interface MovieDetail {
  title: string;
  slug: string;
  poster: string | null;
  synopsis: string | null;
  streams: StreamItem[];
}

export interface IAdapter {
  getName(): string;
  getLatest(page: number): Promise<MovieCard[]>;
  search(query: string): Promise<MovieCard[]>;
  getStream(slug: string): Promise<MovieDetail>;
}

export interface FilterOption {
  title: string;
  parameter: string;
}

export interface FilterResponse {
  genres: FilterOption[];
  countries: FilterOption[];
  years: FilterOption[];
  orders: FilterOption[];
}

export interface MovieResult {
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
}

export interface WatchResponse {
  title: string;
  slug: string;
  streams: StreamItem[];
}

export interface LK21Config {
  BASE_URL: string;
  PLAYER_IFRAME_HOST: string;
  CLOUD_HOST: string;
  USER_AGENT: string;
}

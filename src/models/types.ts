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

export enum LK21Constants {
  BASE_URL = "https://tv7.lk21official.cc",
  PLAYER_IFRAME_HOST = "playeriframe.sbs",
  CLOUD_HOST = "cloud.hownetwork.xyz",
  USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
}

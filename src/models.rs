use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FilterOption {
    pub title: String,
    pub parameter: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FilterResponse {
    pub genres: Vec<FilterOption>,
    pub countries: Vec<FilterOption>,
    pub years: Vec<FilterOption>,
    pub orders: Vec<FilterOption>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MovieResult {
    pub title: String,
    pub slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poster: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamItem {
    pub label: String,
    #[serde(rename = "type")]
    pub stream_type: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatchResponse {
    pub title: String,
    pub slug: String,
    pub streams: Vec<StreamItem>,
}

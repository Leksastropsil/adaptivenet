use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use crate::services::LK21Engine;
use reqwest::StatusCode;

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<LK21Engine>,
}

pub async fn get_filters(
    State(state): State<AppState>,
) -> impl IntoResponse {
    match state.engine.get_filters_metadata().await {
        Ok(data) => (StatusCode::OK, Json(data)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"detail": e.to_string()}))).into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct MoviesQuery {
    #[serde(default = "default_category")]
    pub category: String,
    #[serde(default = "default_page")]
    pub page: i32,
}

fn default_category() -> String { "top-movie-today".to_string() }
fn default_page() -> i32 { 1 }

pub async fn get_movies(
    State(state): State<AppState>,
    Query(params): Query<MoviesQuery>,
) -> impl IntoResponse {
    match state.engine.scrape_catalog(params.page, &params.category).await {
        Ok(data) => (StatusCode::OK, Json(data)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"detail": e.to_string()}))).into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

pub async fn search_movies(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> impl IntoResponse {
    match state.engine.search_movies(&params.q).await {
        Ok(data) => (StatusCode::OK, Json(data)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"detail": e.to_string()}))).into_response(),
    }
}

pub async fn extract_stream(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> impl IntoResponse {
    match state.engine.extract_stream_url(&slug).await {
        Ok(data) => (StatusCode::OK, Json(data)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"detail": e.to_string()}))).into_response(),
    }
}

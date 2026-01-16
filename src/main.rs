mod models;
mod routes;
mod services;

use axum::{
    routing::get,
    Router,
};
use std::sync::Arc;
use tokio::net::TcpListener;
use vercel_runtime::{run, Body, Error, Request, Response};
use tower::ServiceExt;

#[tokio::main]
async fn main() -> Result<(), Error> {
    // If running in Vercel, use the runtime handler.
    // However, since we want a single binary that works locally too (sort of), 
    // the cleanest way for Vercel Rust runtimes is to define the handler entry point.
    // BUT common pattern for "Axum on Vercel" is to use the `vercel_runtime::run` 
    // which expects a generic handler function.
    
    // For Vercel specific entry:
    run(handler).await
}

async fn handler(req: Request) -> Result<Response<Body>, Error> {
    let engine = Arc::new(services::LK21Engine::new());
    let state = routes::AppState { engine };

    let app = Router::new()
        .route("/filters", get(routes::get_filters))
        .route("/movies", get(routes::get_movies))
        .route("/search", get(routes::search_movies))
        .route("/watch/:slug", get(routes::extract_stream))
        .with_state(state);

    // Convert vercel_runtime::Request to axum::http::Request (they are compatible http::Request)
    // Actually vercel_runtime re-exports http types. Axum uses http 1.0 crates usually but 0.7 uses http 1.0.
    // We just need to ensure the request is passed to axum's oneshot.
    
    let response = app.oneshot(req).await.map_err(|e| Error::from(e.to_string()))?;
    
    // Convert axum response to vercel response (both are http::Response)
    Ok(response)
}

mod models;
mod routes;
mod services;

use axum::{
    routing::get,
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let engine = Arc::new(services::LK21Engine::new());
    let state = routes::AppState { engine };

    let app = Router::new()
        .route("/filters", get(routes::get_filters))
        .route("/movies", get(routes::get_movies))
        .route("/search", get(routes::search_movies))
        .route("/watch/:slug", get(routes::extract_stream))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // Get port from env
    let port_str = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let port = port_str.parse::<u16>().expect("PORT must be a valid number");
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

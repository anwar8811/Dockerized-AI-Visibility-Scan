pub mod routes;

use axum::routing::get;
use axum::Router;

// Building the Router here (not inline in main.rs) is what lets
// integration tests in tests/ import and exercise it directly via
// tower::ServiceExt::oneshot (STORY-026) - a plain binary crate's
// main.rs is not importable from tests/, but a lib.rs is.
pub fn build_router() -> Router {
    Router::new().route("/health", get(routes::health::health_handler))
}

use analyzer::build_router;

#[tokio::main]
async fn main() {
    let app = build_router();

    // 0.0.0.0, not 127.0.0.1 - this must still work once the analyzer runs
    // inside a Docker container (STORY-022), where the health check is
    // reached from outside the container.
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080")
        .await
        .expect("failed to bind to 0.0.0.0:8080");

    println!("[ANALYZER] Listening on 0.0.0.0:8080");

    axum::serve(listener, app)
        .await
        .expect("analyzer server crashed");
}

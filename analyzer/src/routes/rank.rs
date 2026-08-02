use axum::Json;

use crate::analysis::citations::extract_citation_domains;
use crate::analysis::ranking::rank_entities;
use crate::models::{RankRequest, RankResponse};

/// POST /analyze/rank (EPIC-13, KAD-26) - additive, alongside the
/// existing, completely unmodified POST /analyze (analyze.rs).
/// Generalizes brand/competitor detection to N named entities, producing
/// a per-prompt rank instead of a single brand-mentioned flag.
/// citation_domains reuses extract_citation_domains() unchanged - no new
/// citation logic exists here.
pub async fn rank_handler(Json(payload): Json<RankRequest>) -> Json<RankResponse> {
    let rankings = rank_entities(&payload.response, &payload.entities);
    let citation_domains = extract_citation_domains(&payload.response);

    Json(RankResponse {
        rankings,
        citation_domains,
    })
}

#[cfg(test)]
mod tests {
    use crate::build_router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[tokio::test]
    async fn rank_endpoint_orders_entities_and_extracts_citations() {
        let app = build_router();

        let request_body = serde_json::json!({
            "response": "NimbusCRM is useful for agencies. Compared with OrbitDesk, \
                          NimbusCRM is more focused on small teams. \
                          See https://reviews.test/crm-comparison for details.",
            "entities": [
                { "id": "brand-1", "name": "NimbusCRM" },
                { "id": "comp-1", "name": "OrbitDesk" },
                { "id": "comp-2", "name": "ClientLoop" }
            ]
        });

        let request = Request::builder()
            .method("POST")
            .uri("/analyze/rank")
            .header("content-type", "application/json")
            .body(Body::from(request_body.to_string()))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();

        let rankings = json["rankings"].as_array().unwrap();
        assert_eq!(rankings.len(), 3);
        assert_eq!(rankings[0]["entityId"], "brand-1");
        assert_eq!(rankings[0]["mentionCount"], 2);
        assert_eq!(rankings[0]["rank"], 1);
        assert_eq!(rankings[1]["entityId"], "comp-1");
        assert_eq!(rankings[1]["mentionCount"], 1);
        assert_eq!(rankings[1]["rank"], 2);
        assert_eq!(rankings[2]["entityId"], "comp-2");
        assert_eq!(rankings[2]["mentionCount"], 0);
        assert_eq!(rankings[2]["rank"], 3);

        assert_eq!(json["citationDomains"], serde_json::json!(["reviews.test"]));
    }
}

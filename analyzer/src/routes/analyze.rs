use axum::Json;

use crate::analysis::brand::detect_brand;
use crate::analysis::citations::extract_citation_domains;
use crate::analysis::competitors::detect_competitors;
use crate::models::{AnalyzeRequest, AnalyzeResponse};

/// POST /analyze (brief §19-20) - orchestrates the three deterministic
/// analysis rules. This handler only wires them together; the actual
/// rules each live in their own testable module under `analysis/`.
pub async fn analyze_handler(Json(payload): Json<AnalyzeRequest>) -> Json<AnalyzeResponse> {
    let (brand_mentioned, brand_mention_count) =
        detect_brand(&payload.response, &payload.brand);
    let competitors_mentioned = detect_competitors(&payload.response, &payload.competitors);
    let citation_domains = extract_citation_domains(&payload.response);

    Json(AnalyzeResponse {
        brand_mentioned,
        brand_mention_count,
        competitors_mentioned,
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
    async fn analyze_endpoint_combines_brand_competitor_and_citation_detection() {
        let app = build_router();

        // Composite example: exercises all three rules in one realistic
        // response, matching the brief's individual worked examples
        // (§20 brand mention count = 2, §20 competitor detection, §20
        // citation extraction) rather than the brief's §19 placeholder
        // text ("AI generated response goes here."), which isn't a
        // response that would actually produce the brief's own numbers.
        // Note: the citation URL deliberately avoids repeating "NimbusCRM"
        // in its path (e.g. not "/nimbuscrm") - detect_brand counts every
        // case-insensitive substring match anywhere in the response, so a
        // brand name embedded in a citation URL would inflate the count
        // and conflate two things this test means to check independently.
        let request_body = serde_json::json!({
            "brand": "NimbusCRM",
            "competitors": ["OrbitDesk", "ClientLoop"],
            "response": "NimbusCRM is useful for agencies. Compared with OrbitDesk, \
                          NimbusCRM is more focused on small teams. \
                          See https://reviews.test/crm-comparison for details."
        });

        let request = Request::builder()
            .method("POST")
            .uri("/analyze")
            .header("content-type", "application/json")
            .body(Body::from(request_body.to_string()))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();

        assert_eq!(json["brandMentioned"], true);
        assert_eq!(json["brandMentionCount"], 2);
        assert_eq!(json["competitorsMentioned"], serde_json::json!(["OrbitDesk"]));
        assert_eq!(json["citationDomains"], serde_json::json!(["reviews.test"]));
    }
}

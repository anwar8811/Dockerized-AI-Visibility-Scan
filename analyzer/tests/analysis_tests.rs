// Integration-level test file - one #[test] per item in the brief's §29
// Rust Tests list, calling the crate's public API directly
// (analyzer::analysis::...) rather than through HTTP. The colocated unit
// tests inside each src/analysis/*.rs module (STORY-014/015/016) already
// exercise these functions in more depth; this file exists so the brief's
// exact 8-item list maps to one clear test each, in one place.
//
// The route-level test (POST /analyze via tower::ServiceExt::oneshot,
// this story's other Technical Note requirement) already exists in
// src/routes/analyze.rs (STORY-016) and is not duplicated here.

use analyzer::analysis::brand::detect_brand;
use analyzer::analysis::citations::extract_citation_domains;
use analyzer::analysis::competitors::detect_competitors;

#[test]
fn brand_detection() {
    let (mentioned, _) = detect_brand("NimbusCRM is a great CRM for small teams.", "NimbusCRM");
    assert!(mentioned);
}

#[test]
fn case_insensitive_matching() {
    let (mentioned, count) =
        detect_brand("nimbuscrm, NIMBUSCRM, and NimbusCRM must all match.", "NimbusCRM");
    assert!(mentioned);
    assert_eq!(count, 3);
}

#[test]
fn brand_mention_count() {
    // The brief's §20 exact worked example.
    let (_, count) = detect_brand(
        "NimbusCRM is useful for agencies. Compared with OrbitDesk, NimbusCRM is more focused...",
        "NimbusCRM",
    );
    assert_eq!(count, 2);
}

#[test]
fn competitor_detection() {
    let competitors = vec!["OrbitDesk".to_string(), "ClientLoop".to_string()];
    let found = detect_competitors(
        "Compared with OrbitDesk, this is a strong option.",
        &competitors,
    );
    assert_eq!(found, vec!["OrbitDesk".to_string()]);
}

#[test]
fn duplicate_competitor_removal() {
    // "OrbitDesk" is mentioned three times in the response - the output
    // must still contain it exactly once, never a duplicate entry.
    let competitors = vec!["OrbitDesk".to_string(), "ClientLoop".to_string()];
    let response = "OrbitDesk is solid. OrbitDesk again. And OrbitDesk once more.";
    let found = detect_competitors(response, &competitors);
    assert_eq!(found, vec!["OrbitDesk".to_string()]);
}

#[test]
fn url_extraction() {
    let domains = extract_citation_domains("See https://reviews.test/nimbuscrm for details.");
    assert_eq!(domains, vec!["reviews.test".to_string()]);
}

#[test]
fn domain_extraction() {
    let domains = extract_citation_domains("Compare at https://comparison.test/crm-tools.");
    assert_eq!(domains, vec!["comparison.test".to_string()]);
}

#[test]
fn duplicate_domain_removal() {
    let domains = extract_citation_domains(
        "See https://reviews.test/nimbuscrm and also https://reviews.test/orbitdesk for more.",
    );
    assert_eq!(domains, vec!["reviews.test".to_string()]);
}

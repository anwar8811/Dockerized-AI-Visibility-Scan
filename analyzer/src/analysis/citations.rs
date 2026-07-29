/// Strips trailing prose punctuation from a URL-like token (brief §20
/// Citation Extraction's known gotcha: a sentence like "...see
/// https://reviews.test/nimbuscrm." would otherwise extract the trailing
/// "." as part of the path, breaking the hostname).
fn strip_trailing_punctuation(token: &str) -> &str {
    token.trim_end_matches(|c: char| matches!(c, '.' | ',' | ')' | ']' | '!' | '?' | ';' | ':' | '\''))
}

/// Extracts just the hostname/domain from a URL - e.g.
/// "https://reviews.test/nimbuscrm" becomes "reviews.test". Returns
/// `None` if `token` isn't a URL at all.
fn extract_hostname(token: &str) -> Option<String> {
    let without_scheme = token
        .strip_prefix("https://")
        .or_else(|| token.strip_prefix("http://"))?;

    let host = without_scheme.split('/').next().unwrap_or("");
    if host.is_empty() {
        None
    } else {
        Some(host.to_lowercase())
    }
}

/// Finds every URL in `response` and returns the unique set of hostnames
/// (brief §20 Citation Extraction) - order of first appearance, no
/// duplicates, even if the same domain is cited via multiple URLs.
pub fn extract_citation_domains(response: &str) -> Vec<String> {
    let mut domains: Vec<String> = Vec::new();

    for raw_token in response.split_whitespace() {
        let token = strip_trailing_punctuation(raw_token);
        if let Some(domain) = extract_hostname(token) {
            if !domains.contains(&domain) {
                domains.push(domain);
            }
        }
    }

    domains
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_the_hostname_from_the_briefs_worked_example() {
        let response = "See https://reviews.test/nimbuscrm for more.";
        assert_eq!(extract_citation_domains(response), vec!["reviews.test"]);
    }

    #[test]
    fn deduplicates_the_same_domain_cited_via_two_different_urls() {
        let response =
            "See https://reviews.test/nimbuscrm and also https://reviews.test/orbitdesk.";
        assert_eq!(extract_citation_domains(response), vec!["reviews.test"]);
    }

    #[test]
    fn strips_trailing_prose_punctuation() {
        let response = "Read more at https://reviews.test/nimbuscrm.";
        assert_eq!(extract_citation_domains(response), vec!["reviews.test"]);
    }

    #[test]
    fn returns_empty_when_the_response_has_no_urls() {
        let response = "NimbusCRM is a great choice for small teams.";
        assert!(extract_citation_domains(response).is_empty());
    }

    #[test]
    fn finds_multiple_distinct_domains_in_order() {
        let response = "See https://reviews.test/nimbuscrm and https://comparison.test/crm-tools.";
        assert_eq!(
            extract_citation_domains(response),
            vec!["reviews.test", "comparison.test"]
        );
    }
}

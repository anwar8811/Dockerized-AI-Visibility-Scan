use super::brand::detect_brand;

/// Checks the response against the request's competitor list,
/// case-insensitively, returning only the competitors that were actually
/// found - never a duplicate (brief §20 Competitor Detection).
///
/// De-duplication here is structural, not a separate pass: this function
/// iterates the input `competitors` slice exactly once and includes each
/// competitor at most once in the output, so a duplicate in the result is
/// impossible by construction - even if a competitor's name appears many
/// times in `response`.
pub fn detect_competitors(response: &str, competitors: &[String]) -> Vec<String> {
    competitors
        .iter()
        .filter(|competitor| detect_brand(response, competitor).0)
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_only_the_competitor_actually_mentioned() {
        let response = "OrbitDesk is a solid pick. OrbitDesk again for emphasis.";
        let competitors = vec!["OrbitDesk".to_string(), "ClientLoop".to_string()];

        let found = detect_competitors(response, &competitors);

        assert_eq!(found, vec!["OrbitDesk".to_string()]);
    }

    #[test]
    fn returns_empty_when_the_competitor_list_is_empty() {
        let response = "OrbitDesk is a solid pick.";
        let competitors: Vec<String> = vec![];

        let found = detect_competitors(response, &competitors);

        assert!(found.is_empty());
    }

    #[test]
    fn matching_is_case_insensitive() {
        let response = "orbitdesk is fine, but CLIENTLOOP is better for small teams.";
        let competitors = vec!["OrbitDesk".to_string(), "ClientLoop".to_string()];

        let mut found = detect_competitors(response, &competitors);
        found.sort();

        assert_eq!(
            found,
            vec!["ClientLoop".to_string(), "OrbitDesk".to_string()]
        );
    }
}

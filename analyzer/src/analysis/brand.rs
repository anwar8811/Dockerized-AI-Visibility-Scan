/// Case-insensitive brand detection + mention count (brief §20 Brand
/// Detection / Brand Mention Count).
///
/// Both parameters are borrowed string slices (`&str`) - this function
/// only ever reads the caller's strings, never takes ownership of them,
/// so the caller can keep using `response`/`brand` afterward.
pub fn detect_brand(response: &str, brand: &str) -> (bool, usize) {
    if brand.is_empty() {
        return (false, 0);
    }

    let response_lower = response.to_lowercase();
    let brand_lower = brand.to_lowercase();

    let count = response_lower.matches(&brand_lower).count();
    (count > 0, count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_two_mentions_in_the_briefs_worked_example() {
        let response =
            "NimbusCRM is useful for agencies. Compared with OrbitDesk, NimbusCRM is more focused...";
        let (mentioned, count) = detect_brand(response, "NimbusCRM");
        assert!(mentioned);
        assert_eq!(count, 2);
    }

    #[test]
    fn reports_no_mention_when_the_brand_never_appears() {
        let response = "OrbitDesk and ClientLoop are both solid choices.";
        let (mentioned, count) = detect_brand(response, "NimbusCRM");
        assert!(!mentioned);
        assert_eq!(count, 0);
    }

    #[test]
    fn matching_is_case_insensitive() {
        let response = "nimbuscrm is great. NIMBUSCRM is also great. NimbusCRM too.";
        let (mentioned, count) = detect_brand(response, "NimbusCRM");
        assert!(mentioned);
        assert_eq!(count, 3);
    }
}

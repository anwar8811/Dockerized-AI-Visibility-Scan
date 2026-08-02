use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct AnalyzeRequest {
    pub brand: String,
    pub competitors: Vec<String>,
    pub response: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResponse {
    pub brand_mentioned: bool,
    pub brand_mention_count: usize,
    pub competitors_mentioned: Vec<String>,
    pub citation_domains: Vec<String>,
}

// EPIC-13 (KAD-26) - additive, alongside the structs above (AnalyzeRequest/
// AnalyzeResponse are completely untouched). One entry per BrandProfile
// (brand + every competitor) - `id` is that row's UUID, echoed back in
// RankedEntity so the caller can match a ranking to its entity without
// re-matching by name string.
#[derive(Debug, Deserialize, Clone)]
pub struct RankEntity {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct RankRequest {
    pub response: String,
    pub entities: Vec<RankEntity>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RankedEntity {
    pub entity_id: String,
    pub mention_count: usize,
    pub rank: usize,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RankResponse {
    pub rankings: Vec<RankedEntity>,
    pub citation_domains: Vec<String>,
}

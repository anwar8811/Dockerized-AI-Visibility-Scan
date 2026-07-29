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

use super::brand::detect_brand;
use crate::models::{RankEntity, RankedEntity};

/// Generalizes detect_brand() (brand.rs) to N named entities (EPIC-13,
/// KAD-26) - each entity's mention count comes from the exact same
/// case-insensitive substring-counting logic already used for the
/// classic brand/competitor detection (FR8.2), looped over a list
/// instead of special-casing one "brand" field and one "competitors"
/// list. `rank` 1 is the entity with the highest mention_count; ties are
/// broken by earliest first-mention character position in `response` (a
/// deterministic tiebreak, never left to iteration order). Every entity
/// passed in gets a ranking entry, even one mentioned zero times.
pub fn rank_entities(response: &str, entities: &[RankEntity]) -> Vec<RankedEntity> {
    let response_lower = response.to_lowercase();

    let mut scored: Vec<(String, usize, usize)> = entities
        .iter()
        .map(|entity| {
            let (_, mention_count) = detect_brand(response, &entity.name);
            let position = first_mention_position(&response_lower, &entity.name);
            (entity.id.clone(), mention_count, position)
        })
        .collect();

    // Vec::sort_by is a stable sort - entities that tie on both
    // mention_count and position (e.g. two entities mentioned zero times,
    // both without a position) keep their original input order rather
    // than an arbitrary one.
    scored.sort_by(|a, b| b.1.cmp(&a.1).then(a.2.cmp(&b.2)));

    scored
        .into_iter()
        .enumerate()
        .map(|(index, (entity_id, mention_count, _))| RankedEntity {
            entity_id,
            mention_count,
            rank: index + 1,
        })
        .collect()
}

/// Character position of `name`'s first case-insensitive occurrence in
/// the already-lowercased `response_lower` - `usize::MAX` (sorts last)
/// when `name` never appears at all, or is empty.
fn first_mention_position(response_lower: &str, name: &str) -> usize {
    if name.is_empty() {
        return usize::MAX;
    }
    response_lower
        .find(&name.to_lowercase())
        .unwrap_or(usize::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entity(id: &str, name: &str) -> RankEntity {
        RankEntity {
            id: id.to_string(),
            name: name.to_string(),
        }
    }

    #[test]
    fn orders_strictly_by_mention_count_descending() {
        let response = "NimbusCRM NimbusCRM NimbusCRM. OrbitDesk OrbitDesk. ClientLoop.";
        let entities = vec![
            entity("brand", "NimbusCRM"),
            entity("comp-1", "OrbitDesk"),
            entity("comp-2", "ClientLoop"),
        ];

        let rankings = rank_entities(response, &entities);

        assert_eq!(rankings[0].entity_id, "brand");
        assert_eq!(rankings[0].mention_count, 3);
        assert_eq!(rankings[0].rank, 1);
        assert_eq!(rankings[1].entity_id, "comp-1");
        assert_eq!(rankings[1].mention_count, 2);
        assert_eq!(rankings[1].rank, 2);
        assert_eq!(rankings[2].entity_id, "comp-2");
        assert_eq!(rankings[2].mention_count, 1);
        assert_eq!(rankings[2].rank, 3);
    }

    #[test]
    fn breaks_a_tied_mention_count_by_earliest_first_mention_position() {
        let response = "ClientLoop is good. OrbitDesk is also good.";
        let entities = vec![entity("comp-1", "OrbitDesk"), entity("comp-2", "ClientLoop")];

        let rankings = rank_entities(response, &entities);

        // Both mentioned exactly once, but "ClientLoop" appears earlier in
        // the response text than "OrbitDesk" - it must rank first,
        // regardless of the entities list's own input order.
        assert_eq!(rankings[0].entity_id, "comp-2");
        assert_eq!(rankings[0].mention_count, 1);
        assert_eq!(rankings[0].rank, 1);
        assert_eq!(rankings[1].entity_id, "comp-1");
        assert_eq!(rankings[1].rank, 2);
    }

    #[test]
    fn an_entity_with_zero_mentions_still_gets_the_lowest_rank_entry() {
        let response = "NimbusCRM is the only one mentioned here.";
        let entities = vec![entity("brand", "NimbusCRM"), entity("comp-1", "OrbitDesk")];

        let rankings = rank_entities(response, &entities);

        assert_eq!(rankings.len(), 2);
        let unmentioned = rankings.iter().find(|r| r.entity_id == "comp-1").unwrap();
        assert_eq!(unmentioned.mention_count, 0);
        assert_eq!(unmentioned.rank, 2);
    }

    #[test]
    fn matching_is_case_insensitive() {
        let response = "nimbuscrm is great, NIMBUSCRM is also great.";
        let entities = vec![entity("brand", "NimbusCRM")];

        let rankings = rank_entities(response, &entities);

        assert_eq!(rankings[0].mention_count, 2);
    }

    #[test]
    fn ties_with_no_mentions_at_all_keep_the_original_input_order() {
        let response = "Neither company is mentioned here.";
        let entities = vec![entity("comp-1", "OrbitDesk"), entity("comp-2", "ClientLoop")];

        let rankings = rank_entities(response, &entities);

        assert_eq!(rankings[0].entity_id, "comp-1");
        assert_eq!(rankings[1].entity_id, "comp-2");
    }
}

import { computeVisibilityScore, computeCompetitorCitationMetrics } from './visibility-scoring';

describe('computeVisibilityScore', () => {
  it('matches the brief §21 worked example: brand appears in 3 of 5 processed prompts -> 60', () => {
    const results = [
      { brandMentioned: true },
      { brandMentioned: true },
      { brandMentioned: true },
      { brandMentioned: false },
      { brandMentioned: false },
    ];

    expect(computeVisibilityScore(results, 5)).toBe(60);
  });
});

describe('computeCompetitorCitationMetrics', () => {
  it('matches the brief §22 competitor-metrics worked example', () => {
    const results = [
      { competitorsMentioned: ['OrbitDesk'], citationDomains: [] },
      { competitorsMentioned: ['OrbitDesk', 'ClientLoop'], citationDomains: [] },
      { competitorsMentioned: ['OrbitDesk'], citationDomains: [] },
      { competitorsMentioned: ['OrbitDesk', 'ClientLoop'], citationDomains: [] },
      { competitorsMentioned: [], citationDomains: [] },
    ];

    const { competitorMentions, topCompetitor } = computeCompetitorCitationMetrics(results);

    expect(competitorMentions).toEqual({ OrbitDesk: 4, ClientLoop: 2 });
    expect(topCompetitor).toBe('OrbitDesk');
  });

  it('matches the brief §23 citation-metrics worked example (de-duplicated union across responses)', () => {
    const results = [
      { competitorsMentioned: [], citationDomains: ['reviews.test'] },
      { competitorsMentioned: [], citationDomains: ['reviews.test', 'comparison.test'] },
    ];

    const { citationDomains } = computeCompetitorCitationMetrics(results);

    expect(citationDomains).toEqual(['reviews.test', 'comparison.test']);
  });

  it('returns null topCompetitor when no competitor was ever mentioned', () => {
    const results = [{ competitorsMentioned: [], citationDomains: [] }];

    const { topCompetitor } = computeCompetitorCitationMetrics(results);

    expect(topCompetitor).toBeNull();
  });
});

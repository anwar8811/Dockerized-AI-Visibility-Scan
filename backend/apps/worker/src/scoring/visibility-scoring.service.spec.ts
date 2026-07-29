import { VisibilityScoringService } from './visibility-scoring.service';

describe('VisibilityScoringService', () => {
  it('combines the visibility score and competitor/citation metrics from one set of prompt results', () => {
    const service = new VisibilityScoringService();

    const promptResults = [
      { brandMentioned: true, competitorsMentioned: ['OrbitDesk'], citationDomains: ['reviews.test'] },
      { brandMentioned: true, competitorsMentioned: [], citationDomains: ['comparison.test'] },
      { brandMentioned: true, competitorsMentioned: ['OrbitDesk'], citationDomains: [] },
      { brandMentioned: false, competitorsMentioned: [], citationDomains: [] },
      { brandMentioned: false, competitorsMentioned: [], citationDomains: [] },
    ];

    const result = service.computeAggregates(promptResults, 5);

    expect(result).toEqual({
      visibilityScore: 60,
      competitorMentions: { OrbitDesk: 2 },
      topCompetitor: 'OrbitDesk',
      citationDomains: ['reviews.test', 'comparison.test'],
    });
  });
});

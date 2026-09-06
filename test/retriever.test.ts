import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generatePrecedents } from '../src/db/seedData';
import { HybridRetriever } from '../src/core/hybridRetriever';
import { SOPSection } from '../src/types';

describe('Hybrid Retriever & Ranking Engine', () => {
  const precedents = generatePrecedents();
  const retriever = new HybridRetriever(precedents);

  it('should seed and index at least 200 FDA precedents', () => {
    assert.ok(precedents.length >= 200, `Expected >= 200 precedents, got ${precedents.length}`);
  });

  it('should retrieve relevant 21 CFR 211.192 precedents for deviation clauses', async () => {
    const testSection: SOPSection = {
      sectionNumber: '4.2',
      title: 'Deviation Handling & Escalation',
      content: 'Investigations shall be completed as soon as feasible without statutory limits on open deviations.',
      startLine: 10,
      wordCount: 15,
      keyEntities: ['deviation', 'investigation', 'as soon as feasible'],
    };

    const matches = await retriever.retrieveMatches(testSection, 3);
    assert.strictEqual(matches.length, 3);
    assert.ok(matches[0].finalScore > 0);

    const hasDeviationMatch = matches.some((m) =>
      m.precedent.category.includes('Deviation') || m.precedent.cfr_citation.includes('211.192')
    );
    assert.ok(hasDeviationMatch, 'Top matches should include deviation precedent');
  });

  it('should retrieve relevant cleaning validation precedents for periodic cleaning clause', async () => {
    const testSection: SOPSection = {
      sectionNumber: '6.1',
      title: 'Cleaning Validation Frequency',
      content: 'Cleaning verification shall be performed periodically using visual inspection between campaigns.',
      startLine: 25,
      wordCount: 14,
      keyEntities: ['cleaning', 'periodic', 'visually clean'],
    };

    const matches = await retriever.retrieveMatches(testSection, 3);
    assert.strictEqual(matches.length, 3);

    const hasCleaningMatch = matches.some((m) =>
      m.precedent.category.includes('Cleaning') || m.precedent.cfr_citation.includes('211.67')
    );
    assert.ok(hasCleaningMatch, 'Top matches should include cleaning validation precedent');
  });
});

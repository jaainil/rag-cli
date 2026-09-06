import { PrecedentFlag, SOPSection } from '../types';
import { EmbeddingEngine } from './embeddings';

export interface RetrievalResult {
  precedent: PrecedentFlag;
  finalScore: number;
  vectorScore: number;
  bm25Score: number;
  recencyFactor: number;
  feedbackMultiplier: number;
}

export class HybridRetriever {
  private precedents: PrecedentFlag[];
  private precedentVectors: Map<string, number[]> = new Map();
  private embeddingEngine: EmbeddingEngine;
  private currentYear: number = 2026;

  // BM25 parameters
  private k1: number = 1.2;
  private b: number = 0.75;
  private avgDocLength: number = 0;
  private docFrequencies: Map<string, number> = new Map();

  constructor(precedents: PrecedentFlag[], embeddingEngine?: EmbeddingEngine) {
    this.precedents = precedents;
    this.embeddingEngine = embeddingEngine || new EmbeddingEngine();
    this.initIndices();
  }

  private initIndices(): void {
    let totalTerms = 0;

    // 1. Calculate document frequencies for BM25 and build vectors
    for (const prec of this.precedents) {
      // Build dense vector
      const textToEmbed = `${prec.category} ${prec.cfr_citation} ${prec.issue_summary} ${prec.excerpt} ${prec.keywords.join(' ')}`;
      const vec = this.embeddingEngine.embedLocal(textToEmbed);
      this.precedentVectors.set(prec.id, vec);

      // BM25 term stats
      const tokens = this.tokenize(textToEmbed);
      totalTerms += tokens.length;
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        this.docFrequencies.set(token, (this.docFrequencies.get(token) || 0) + 1);
      }
    }

    this.avgDocLength = this.precedents.length > 0 ? totalTerms / this.precedents.length : 1;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private calculateBM25(queryTokens: string[], docText: string): number {
    const docTokens = this.tokenize(docText);
    const docLen = docTokens.length;
    if (docLen === 0) return 0;

    const termCounts = new Map<string, number>();
    for (const t of docTokens) {
      termCounts.set(t, (termCounts.get(t) || 0) + 1);
    }

    let score = 0;
    const N = this.precedents.length;

    for (const term of queryTokens) {
      const tf = termCounts.get(term) || 0;
      if (tf === 0) continue;

      const df = this.docFrequencies.get(term) || 1;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + (this.b * docLen) / this.avgDocLength);

      score += idf * (numerator / denominator);
    }

    return score;
  }

  /**
   * Recency decay:
   * Newer precedents outrank older ones at equal similarity.
   * e^-0.03 * age gives ~0.97 for 1-year-old, ~0.83 for 6-year-old, ~0.74 for 10-year-old.
   */
  private calculateRecencyDecay(dateIssued: string): number {
    try {
      const year = parseInt(dateIssued.split('-')[0], 10);
      if (isNaN(year)) return 0.9;
      const age = Math.max(0, this.currentYear - year);
      return Math.exp(-0.025 * age);
    } catch {
      return 0.9;
    }
  }

  /**
   * Hybrid retrieval for a given SOP section.
   */
  public async retrieveMatches(section: SOPSection, topK: number = 3): Promise<RetrievalResult[]> {
    const queryText = `${section.title} ${section.content} ${section.keyEntities.join(' ')}`;
    const queryTokens = this.tokenize(queryText);
    const queryVector = await this.embeddingEngine.embed(queryText);

    const candidates: RetrievalResult[] = [];

    // Max BM25 normalization tracker
    let maxBm25 = 0.0001;
    const bm25Scores: number[] = [];

    for (const prec of this.precedents) {
      const precText = `${prec.category} ${prec.cfr_citation} ${prec.issue_summary} ${prec.excerpt} ${prec.keywords.join(' ')}`;
      const bScore = this.calculateBM25(queryTokens, precText);
      bm25Scores.push(bScore);
      if (bScore > maxBm25) maxBm25 = bScore;
    }

    for (let i = 0; i < this.precedents.length; i++) {
      const prec = this.precedents[i];
      const precVec = this.precedentVectors.get(prec.id) || [];
      const vScore = Math.max(0, EmbeddingEngine.cosineSimilarity(queryVector, precVec));
      const normBm25 = Math.min(1.0, bm25Scores[i] / maxBm25);

      const recency = this.calculateRecencyDecay(prec.date_issued);
      const feedback = prec.feedback_score ?? 1.0;

      // Weighted score: 60% semantic vector + 40% BM25 lexical
      const rawRelevance = 0.6 * vScore + 0.4 * normBm25;
      const finalScore = rawRelevance * recency * feedback;

      candidates.push({
        precedent: prec,
        finalScore,
        vectorScore: vScore,
        bm25Score: normBm25,
        recencyFactor: recency,
        feedbackMultiplier: feedback,
      });
    }

    // Sort descending by finalScore
    candidates.sort((a, b) => b.finalScore - a.finalScore);
    return candidates.slice(0, topK);
  }
}

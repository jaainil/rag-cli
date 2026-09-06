import { PrecedentFlag, SOPSection } from '../types';
import { EmbeddingEngine } from './embeddings';
import { PostgresManager } from '../db/postgres';
import { DragonflyCacheManager } from '../cache/dragonfly';
import { OpenRouterClient } from './openRouterClient';

export interface RetrievalResult {
  precedent: PrecedentFlag;
  finalScore: number;
  vectorScore: number;
  bm25Score: number;
  recencyFactor: number;
  feedbackMultiplier: number;
  rerankScore?: number;
}

export class HybridRetriever {
  private precedents: PrecedentFlag[];
  private precedentVectors: Map<string, number[]> = new Map();
  private embeddingEngine: EmbeddingEngine;
  private pgManager?: PostgresManager;
  private cache: DragonflyCacheManager;
  private openRouter: OpenRouterClient;
  private currentYear: number = 2026;

  // BM25 parameters
  private k1: number = 1.2;
  private b: number = 0.75;
  private avgDocLength: number = 0;
  private docFrequencies: Map<string, number> = new Map();

  constructor(
    precedents: PrecedentFlag[],
    embeddingEngine?: EmbeddingEngine,
    pgManager?: PostgresManager,
    cache?: DragonflyCacheManager
  ) {
    this.precedents = precedents;
    this.cache = cache || new DragonflyCacheManager();
    this.embeddingEngine = embeddingEngine || new EmbeddingEngine(undefined, this.cache);
    this.pgManager = pgManager;
    this.openRouter = new OpenRouterClient(undefined, this.cache);
    this.initIndices();
  }

  private initIndices(): void {
    let totalTerms = 0;

    for (const prec of this.precedents) {
      const textToEmbed = `${prec.category} ${prec.cfr_citation} ${prec.issue_summary} ${prec.excerpt} ${prec.keywords.join(' ')}`;
      const vec = this.embeddingEngine.embedLocal(textToEmbed);
      this.precedentVectors.set(prec.id, vec);

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
   * Hybrid retrieval with PostgreSQL pgvector, BM25, and OpenRouter voyageai/rerank-2.5 re-ranking.
   */
  public async retrieveMatches(section: SOPSection, topK: number = 3): Promise<RetrievalResult[]> {
    const queryText = `${section.title} ${section.content} ${section.keyEntities.join(' ')}`;
    const cacheKey = `query:${queryText.slice(0, 100)}:${topK}`;

    // 1. Check Dragonfly cache
    const cached = await this.cache.getCachedQueryResult<RetrievalResult[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }

    const queryTokens = this.tokenize(queryText);
    const queryVector = await this.embeddingEngine.embed(queryText);

    let candidates: RetrievalResult[] = [];

    // 2. Check if native pgvector is available
    if (this.pgManager) {
      try {
        const pgResults = await this.pgManager.vectorSearch(queryVector, topK * 4);
        if (pgResults && pgResults.length > 0) {
          let maxBm25 = 0.0001;
          const bm25Scores: number[] = [];

          for (const item of pgResults) {
            const itemText = `${item.category} ${item.cfr_citation} ${item.issue_summary} ${item.excerpt} ${(item.keywords || []).join(' ')}`;
            const bScore = this.calculateBM25(queryTokens, itemText);
            bm25Scores.push(bScore);
            if (bScore > maxBm25) maxBm25 = bScore;
          }

          for (let i = 0; i < pgResults.length; i++) {
            const item = pgResults[i];
            const vScore = item.cosineSimilarity;
            const normBm25 = Math.min(1.0, bm25Scores[i] / maxBm25);
            const recency = this.calculateRecencyDecay(item.date_issued);
            const feedback = item.feedback_score || 1.0;
            const finalScore = (0.65 * vScore + 0.35 * normBm25) * recency * feedback;

            candidates.push({
              precedent: item,
              finalScore,
              vectorScore: vScore,
              bm25Score: normBm25,
              recencyFactor: recency,
              feedbackMultiplier: feedback,
            });
          }
        }
      } catch (err) {
        // Fallback to in-memory/local
      }
    }

    // 3. Fallback: In-Memory / SQLite candidates if PG empty
    if (candidates.length === 0) {
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
        const finalScore = (0.6 * vScore + 0.4 * normBm25) * recency * feedback;

        candidates.push({
          precedent: prec,
          finalScore,
          vectorScore: vScore,
          bm25Score: normBm25,
          recencyFactor: recency,
          feedbackMultiplier: feedback,
        });
      }
    }

    // Sort descending by initial finalScore
    candidates.sort((a, b) => b.finalScore - a.finalScore);
    const topCandidates = candidates.slice(0, Math.max(topK, 5));

    // 4. Apply cloud re-ranking with voyageai/rerank-2.5 via OpenRouter
    try {
      const docsForRerank = topCandidates.map((c) => ({
        id: c.precedent.id,
        text: `${c.precedent.category}: ${c.precedent.cfr_citation} ${c.precedent.issue_summary} ${c.precedent.excerpt.slice(0, 300)}`,
      }));

      const reranked = await this.openRouter.rerank(section.content.slice(0, 500), docsForRerank);
      const scoreMap = new Map(reranked.map((r) => [r.id, r.score]));

      for (const cand of topCandidates) {
        const rerankVal = scoreMap.get(cand.precedent.id);
        if (rerankVal !== undefined) {
          cand.rerankScore = rerankVal;
          // Blend 50% hybrid score + 50% cross-encoder re-rank score
          cand.finalScore = cand.finalScore * 0.5 + rerankVal * 0.5;
        }
      }

      topCandidates.sort((a, b) => b.finalScore - a.finalScore);
    } catch {
      // Re-ranking fallback
    }

    const finalTop = topCandidates.slice(0, topK);

    // Cache in Dragonfly
    await this.cache.setCachedQueryResult(cacheKey, finalTop, 1800);
    return finalTop;
  }
}

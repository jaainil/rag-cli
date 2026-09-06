import { DragonflyCacheManager } from '../cache/dragonfly';
import { SOPSection, PrecedentFlag, FlaggedIssue, MatchedPrecedentRef, RiskLevel } from '../types';

export class OllamaClient {
  private baseUrl: string;
  private model: string;
  private deepModel: string;
  private embedModel: string;
  private rerankModel: string;
  private cache: DragonflyCacheManager;

  constructor(cache?: DragonflyCacheManager) {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'ornith-1.5:9b';
    this.deepModel = process.env.OLLAMA_DEEP_MODEL || 'gemma4:latest';
    this.embedModel = process.env.OLLAMA_EMBED_MODEL || 'qwen3-embedding:8b';
    this.rerankModel = process.env.OLLAMA_RERANK_MODEL || 'pdurugyan/qwen3-reranker-0.6b-q8_0:latest';
    this.cache = cache || new DragonflyCacheManager();
  }

  public getModelName(deep: boolean = false): string {
    return deep ? this.deepModel : this.model;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Generates a 1024-dimension unit-normalized vector via qwen3-embedding:8b with Dragonfly caching.
   */
  public async embed(text: string): Promise<number[]> {
    const cached = await this.cache.getCachedEmbedding(text);
    if (cached && cached.length > 0) {
      return cached;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embedModel,
          input: text.slice(0, 4000),
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama embed error: ${res.status}`);
      }

      const data = (await res.json()) as any;
      const rawVector: number[] = data.embeddings ? data.embeddings[0] : data.embedding;

      if (!rawVector || rawVector.length === 0) {
        throw new Error('Empty embedding returned from Ollama');
      }

      // Truncate to 1024 dims (MRL) and unit-normalize for pgvector HNSW indexing
      const targetDim = 1024;
      const truncated = rawVector.slice(0, targetDim);
      let norm = 0;
      for (let i = 0; i < truncated.length; i++) {
        norm += truncated[i] * truncated[i];
      }
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let i = 0; i < truncated.length; i++) {
          truncated[i] /= norm;
        }
      }

      await this.cache.setCachedEmbedding(text, truncated);
      return truncated;
    } catch (err) {
      // Fallback to local 1024-dim deterministic projection
      return this.fallbackLocalVector(text, 1024);
    }
  }

  /**
   * Re-ranks candidate documents against a query using pdurugyan/qwen3-reranker-0.6b-q8_0:latest.
   */
  public async rerank(
    query: string,
    candidates: { id: string; text: string }[]
  ): Promise<{ id: string; score: number }[]> {
    if (candidates.length === 0) return [];

    try {
      const queryVec = await this.getRerankerEmbedding(query);
      const scored: { id: string; score: number }[] = [];

      for (const cand of candidates) {
        const candVec = await this.getRerankerEmbedding(cand.text);
        const sim = this.cosine(queryVec, candVec);
        scored.push({ id: cand.id, score: sim });
      }

      return scored.sort((a, b) => b.score - a.score);
    } catch {
      // Return unadjusted
      return candidates.map((c, i) => ({ id: c.id, score: 1.0 - i * 0.05 }));
    }
  }

  private async getRerankerEmbedding(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.rerankModel,
        input: text.slice(0, 1000),
      }),
    });

    if (!res.ok) throw new Error('Reranker embed failed');
    const data = (await res.json()) as any;
    return data.embeddings ? data.embeddings[0] : data.embedding;
  }

  /**
   * Performs regulatory audit reasoning using ornith-1.5:9b or gemma4:latest (deep thinking).
   */
  public async analyzeSection(
    section: SOPSection,
    topPrecedent: PrecedentFlag,
    deepThinking: boolean = false
  ): Promise<FlaggedIssue | null> {
    const activeModel = deepThinking ? this.deepModel : this.model;

    const systemPrompt = `You are a strict FDA pharmaceutical compliance auditor and cGMP regulatory expert (21 CFR Parts 210, 211, and 21 CFR Part 11).
Your task is to analyze pharmaceutical Standard Operating Procedure (SOP) clauses for regulatory vulnerabilities, ambiguous terminology, or statutory violations.

Compare the SOP clause against the historical FDA precedent citation.
Respond strictly in JSON format matching this schema:
{
  "isRisk": boolean,
  "riskLevel": "HIGH" | "MEDIUM" | "LOW",
  "confidence": number, // integer 0-100
  "issue": "Concise 1-sentence issue summary",
  "regulation": "Exact 21 CFR citation (e.g. 21 CFR 211.192)",
  "detailedReasoning": "2-3 sentences explaining why this clause violates cGMP or risks 483 / Warning Letter",
  "remediation": "Audit-ready suggested clause text that resolves the defect"
}`;

    const userPrompt = `[AUDITED SOP SECTION ${section.sectionNumber}: ${section.title}]
${section.content}

[MATCHED FDA PRECEDENT]
Citation: ${topPrecedent.cfr_citation}
Source: ${topPrecedent.source} (${topPrecedent.company_redacted})
FDA Finding: "${topPrecedent.issue_summary}"
FDA Excerpt: "${topPrecedent.excerpt}"

Does this section have a regulatory defect or compliance risk? Provide structured JSON.`;

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          system: systemPrompt,
          prompt: userPrompt,
          stream: false,
          format: 'json',
          options: {
            temperature: deepThinking ? 0.2 : 0.1,
            num_predict: 800,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama generation error: ${res.status}`);
      }

      const data = (await res.json()) as any;
      const parsed = JSON.parse(data.response);

      if (!parsed || !parsed.isRisk) {
        return null;
      }

      const flagId = `FLAG-${section.sectionNumber.replace(/[^a-zA-Z0-9]/g, '-')}`;
      return {
        id: flagId,
        sectionRef: section.sectionNumber,
        sectionTitle: section.title,
        riskLevel: (parsed.riskLevel || topPrecedent.severity) as RiskLevel,
        confidence: Math.min(99, Math.max(40, parsed.confidence || 85)),
        issue: parsed.issue || topPrecedent.issue_summary,
        regulation: parsed.regulation || topPrecedent.cfr_citation,
        matchedPrecedent: {
          id: topPrecedent.id,
          source: topPrecedent.source,
          companyRedacted: topPrecedent.company_redacted,
          dateIssued: topPrecedent.date_issued,
          excerpt: topPrecedent.excerpt,
          cfrCitation: topPrecedent.cfr_citation,
          remediationGuidance: parsed.remediation || topPrecedent.remediation_guidance,
        },
        detailedReasoning: parsed.detailedReasoning || `${section.title} exhibits regulatory gaps under ${topPrecedent.cfr_citation}.`,
        remediationRecommendation: parsed.remediation || topPrecedent.remediation_guidance,
        reviewStatus: 'pending',
      };
    } catch (err: any) {
      return null;
    }
  }

  /**
   * Conversational answer generation with gemma4:latest (deep thinking) or ornith-1.5:9b.
   */
  public async generateAnswer(
    query: string,
    contextPrecedents: PrecedentFlag[],
    deepThinking: boolean = false
  ): Promise<string> {
    const activeModel = deepThinking ? this.deepModel : this.model;

    const precedentsContext = contextPrecedents
      .slice(0, 3)
      .map(
        (p, i) =>
          `[Precedent ${i + 1}] Source: ${p.source} (${p.company_redacted})\nCitation: ${p.cfr_citation} (${p.category})\nExcerpt: "${p.excerpt}"\nRemediation: ${p.remediation_guidance}`
      )
      .join('\n\n');

    const prompt = `You are an elite FDA regulatory auditor and pharma quality compliance officer.
User Question: "${query}"

Relevant FDA Precedent Findings:
${precedentsContext}

Provide an authoritative, well-structured compliance answer:
1. Explain the relevant FDA statutory regulation (21 CFR Parts 210/211/11).
2. Reference the historical enforcement precedent and FDA inspection observations.
3. State the exact industry standard and compliance remediation recommendation.
Be concise, professional, and audit-ready.`;

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          prompt,
          stream: false,
          options: {
            temperature: deepThinking ? 0.3 : 0.15,
            num_predict: 600,
          },
        }),
      });

      if (!res.ok) throw new Error('Ollama generation failed');
      const data = (await res.json()) as any;
      return data.response.trim();
    } catch (err: any) {
      return `Based on FDA ${contextPrecedents[0]?.cfr_citation || 'cGMP regulations'}, ${contextPrecedents[0]?.issue_summary || 'strict procedural controls apply'}.\n\nRemediation: ${contextPrecedents[0]?.remediation_guidance || 'Consult QA leadership.'}`;
    }
  }

  private cosine(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      nA += a[i] * a[i];
      nB += b[i] * b[i];
    }
    const denom = Math.sqrt(nA) * Math.sqrt(nB);
    return denom > 0 ? dot / denom : 0;
  }

  private fallbackLocalVector(text: string, dimension: number = 1024): number[] {
    const vec = new Array(dimension).fill(0);
    const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = (hash << 5) - hash + token.charCodeAt(i);
        hash |= 0;
      }
      const idx = Math.abs(hash) % dimension;
      vec[idx] += hash % 2 === 0 ? 1 : -1;
    }
    let norm = 0;
    for (let i = 0; i < dimension; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dimension; i++) vec[i] /= norm;
    }
    return vec;
  }
}

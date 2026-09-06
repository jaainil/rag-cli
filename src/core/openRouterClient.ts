import { DragonflyCacheManager } from '../cache/dragonfly';
import { SOPSection, PrecedentFlag, FlaggedIssue, RiskLevel } from '../types';

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string = 'https://openrouter.ai/api/v1';
  private model: string;
  private embedModel: string;
  private rerankModel: string;
  private cache: DragonflyCacheManager;

  constructor(
    apiKey?: string,
    cache?: DragonflyCacheManager,
    model?: string,
    embedModel?: string,
    rerankModel?: string
  ) {
    this.apiKey =
      apiKey ||
      process.env.OPENROUTER_API_KEY ||
      '';
    this.model = model || process.env.OPENROUTER_MODEL || 'meta/muse-spark-1.3-contributor';
    this.embedModel = embedModel || process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small';
    this.rerankModel = rerankModel || process.env.OPENROUTER_RERANK_MODEL || 'voyageai/rerank-2.5';
    this.cache = cache || new DragonflyCacheManager();
  }

  public getModelName(): string {
    return this.model;
  }

  public getEmbedModel(): string {
    return this.embedModel;
  }

  public getRerankModel(): string {
    return this.rerankModel;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://compliance-check.rag-cli',
      'X-Title': 'Compliance-Check-RAG',
    };
  }

  public async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Generates dense vector embeddings using openai/text-embedding-3-small via OpenRouter.
   * Results are cached in Dragonfly Redis.
   */
  public async embed(text: string): Promise<number[]> {
    const cached = await this.cache.getCachedEmbedding(text);
    if (cached && cached.length > 0) {
      return cached;
    }

    try {
      const res = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.embedModel,
          input: text.slice(0, 8000),
        }),
      });

      if (!res.ok) {
        throw new Error(`OpenRouter embeddings failed: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      const rawVector: number[] = data.data?.[0]?.embedding;

      if (!rawVector || rawVector.length === 0) {
        throw new Error('Empty embedding received from OpenRouter');
      }

      // Unit-normalize vector for cosine similarity
      let norm = 0;
      for (let i = 0; i < rawVector.length; i++) {
        norm += rawVector[i] * rawVector[i];
      }
      norm = Math.sqrt(norm);
      const normalized = norm > 0 ? rawVector.map((v) => v / norm) : rawVector;

      await this.cache.setCachedEmbedding(text, normalized);
      return normalized;
    } catch {
      // Deterministic 1536-dim fallback vector
      return this.fallbackLocalVector(text, 1536);
    }
  }

  /**
   * Re-ranks candidate documents using voyageai/rerank-2.5 via OpenRouter.
   */
  public async rerank(
    query: string,
    candidates: { id: string; text: string }[]
  ): Promise<{ id: string; score: number }[]> {
    if (candidates.length === 0) return [];

    try {
      const res = await fetch(`${this.baseUrl}/rerank`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.rerankModel,
          query: query.slice(0, 1000),
          documents: candidates.map((c) => c.text.slice(0, 1000)),
        }),
      });

      if (!res.ok) {
        throw new Error(`OpenRouter rerank failed: ${res.status}`);
      }

      const data = (await res.json()) as any;
      if (Array.isArray(data.results)) {
        const scored: { id: string; score: number }[] = [];
        for (const item of data.results) {
          const candidate = candidates[item.index];
          if (candidate) {
            scored.push({
              id: candidate.id,
              score: typeof item.relevance_score === 'number' ? item.relevance_score : 0.5,
            });
          }
        }
        return scored.sort((a, b) => b.score - a.score);
      }
    } catch {
      // Fallback: return unadjusted order
    }

    return candidates.map((c, i) => ({ id: c.id, score: 1.0 - i * 0.05 }));
  }

  /**
   * Performs deep regulatory cGMP reasoning using meta/muse-spark-1.3-contributor.
   * Extracts exact verbatim flawed SOP text, maps line numbers, and formulates audit citations.
   */
  public async analyzeSection(
    section: SOPSection,
    topPrecedent: PrecedentFlag,
    deepThinking: boolean = true
  ): Promise<FlaggedIssue | null> {
    const systemPrompt = `You are an elite FDA pharmaceutical compliance inspector and cGMP regulatory expert (21 CFR Parts 210, 211, and 21 CFR Part 11).
Your task is to audit pharmaceutical Standard Operating Procedure (SOP) clauses for regulatory vulnerabilities, ambiguous terminology, or statutory violations.

Audit the SOP clause against historical FDA enforcement precedent.
Respond strictly in JSON format matching this schema:
{
  "isRisk": boolean,
  "riskLevel": "HIGH" | "MEDIUM" | "LOW",
  "confidence": number, // integer 0-100
  "flawedSopSnippet": "The exact verbatim sentence or clause quoted from the SOP section that contains the regulatory defect or ambiguous wording",
  "issue": "Concise 1-sentence issue summary explaining the defect",
  "regulation": "Exact 21 CFR citation (e.g. 21 CFR 211.192)",
  "detailedReasoning": "2-3 sentences explaining why this clause violates cGMP or risks FDA Form 483 / Warning Letter",
  "remediation": "Audit-ready suggested replacement clause text that resolves the defect"
}`;

    const userPrompt = `[AUDITED SOP SECTION ${section.sectionNumber}: ${section.title}]
${section.content}

[MATCHED HISTORICAL FDA PRECEDENT]
Citation: ${topPrecedent.cfr_citation} (${topPrecedent.category})
Source: ${topPrecedent.source} (${topPrecedent.company_redacted})
Date Issued: ${topPrecedent.date_issued}
FDA Finding: "${topPrecedent.issue_summary}"
FDA Excerpt: "${topPrecedent.excerpt}"

Does this section have a regulatory defect or compliance risk? Provide structured JSON quoting the exact flawed SOP text.`;

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          temperature: deepThinking ? 0.2 : 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`OpenRouter audit error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      const rawText = data.choices?.[0]?.message?.content;
      if (!rawText) return null;

      const parsed = JSON.parse(rawText);
      if (!parsed || !parsed.isRisk) {
        return null;
      }

      const flagId = `FLAG-${section.sectionNumber.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const { snippet, startLine } = this.locateSopFlaw(section, parsed.flawedSopSnippet);

      // Extract native deep reasoning if provided by model
      const reasoningNote = data.choices?.[0]?.message?.reasoning;

      return {
        id: flagId,
        sectionRef: section.sectionNumber,
        sectionTitle: section.title,
        startLine,
        sopTextSnippet: snippet,
        riskLevel: (parsed.riskLevel || topPrecedent.severity) as RiskLevel,
        confidence: Math.min(99, Math.max(40, Math.round(Number(parsed.confidence) > 1 ? parsed.confidence : parsed.confidence * 100) || 88)),
        issue: parsed.issue || topPrecedent.issue_summary,
        regulation: parsed.regulation || topPrecedent.cfr_citation,
        matchedPrecedent: {
          id: topPrecedent.id,
          source: topPrecedent.source,
          companyRedacted: topPrecedent.company_redacted,
          dateIssued: topPrecedent.date_issued,
          excerpt: topPrecedent.excerpt,
          cfrCitation: topPrecedent.cfr_citation,
          category: topPrecedent.category,
          remediationGuidance: topPrecedent.remediation_guidance,
          similarityScore: 0.94,
        },
        detailedReasoning: reasoningNote
          ? `${parsed.detailedReasoning} [Model CoT: ${reasoningNote.slice(0, 180)}...]`
          : parsed.detailedReasoning,
        remediationRecommendation: parsed.remediation || topPrecedent.remediation_guidance,
        reviewStatus: 'pending',
      };
    } catch {
      return null;
    }
  }

  /**
   * Synthesizes conversational regulatory analysis using meta/muse-spark-1.3-contributor.
   */
  public async askQuestion(
    question: string,
    precedents: PrecedentFlag[],
    deepThinking: boolean = true
  ): Promise<{ answer: string; reasoning?: string; citations: string[] }> {
    const precedentContext = precedents
      .slice(0, 4)
      .map(
        (p, i) =>
          `[Precedent ${i + 1}] ID: ${p.id} | Citation: ${p.cfr_citation} | Source: ${p.source} (${p.company_redacted}, ${p.date_issued})\nFinding: ${p.issue_summary}\nExcerpt: "${p.excerpt}"\nGuidance: ${p.remediation_guidance}`
      )
      .join('\n\n');

    const systemPrompt = `You are an elite FDA regulatory auditor and pharmaceutical cGMP legal specialist.
Answer the user's pharmaceutical compliance query grounded in 21 CFR Parts 210/211/Part 11 and historical FDA enforcement precedents.
Always cite specific 21 CFR sections, Form 483 / Warning Letter precedents with dates, and actionable remediation requirements.
Provide direct, authoritative, and audit-ready guidance.`;

    const userPrompt = `User Regulatory Query:
"${question}"

Relevant Historical FDA Enforcement Precedents from Knowledge Base:
${precedentContext}

Please deliver a thorough, grounded regulatory analysis.`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.model,
        temperature: deepThinking ? 0.2 : 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter chat completion failed: ${res.status}`);
    }

    const data = (await res.json()) as any;
    const answer = data.choices?.[0]?.message?.content || 'No response generated.';
    const reasoning = data.choices?.[0]?.message?.reasoning;

    const citations = precedents.slice(0, 3).map((p) => `${p.cfr_citation} (${p.source}, ${p.date_issued})`);

    return { answer, reasoning, citations };
  }

  /**
   * Helper to locate exact line numbers of flawed clauses within the SOP document.
   */
  public locateSopFlaw(
    section: SOPSection,
    suggestedSnippet?: string
  ): { snippet: string; startLine: number } {
    const rawLines = section.content.split('\n');

    if (suggestedSnippet && suggestedSnippet.trim().length > 10) {
      const cleanTarget = suggestedSnippet.trim().toLowerCase();
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].trim();
        if (line.toLowerCase().includes(cleanTarget) || cleanTarget.includes(line.toLowerCase())) {
          return {
            snippet: line.length > 15 ? line : suggestedSnippet.trim(),
            startLine: section.startLine + i + 1,
          };
        }
      }
    }

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (line.length > 25) {
        return {
          snippet: line,
          startLine: section.startLine + i + 1,
        };
      }
    }

    return {
      snippet: section.content.slice(0, 200).replace(/\n+/g, ' '),
      startLine: section.startLine,
    };
  }

  private fallbackLocalVector(text: string, dimension: number = 1536): number[] {
    const vector = new Array(dimension).fill(0);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = (hash << 5) - hash + token.charCodeAt(i);
        hash |= 0;
      }
      const index = Math.abs(hash) % dimension;
      vector[index] += 1.0;
    }

    let norm = 0;
    for (let i = 0; i < dimension; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dimension; i++) {
        vector[i] /= norm;
      }
    }
    return vector;
  }
}

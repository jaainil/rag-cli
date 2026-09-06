import crypto from 'crypto';
import { DragonflyCacheManager } from '../cache/dragonfly';
import { OllamaClient } from './ollamaClient';

export class EmbeddingEngine {
  private dimension: number = 1024;
  private apiKey?: string;
  private cache: DragonflyCacheManager;
  private ollama: OllamaClient;
  private useOllama: boolean = true;

  constructor(apiKey?: string, cache?: DragonflyCacheManager) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || process.env.VOYAGE_API_KEY;
    this.cache = cache || new DragonflyCacheManager();
    this.ollama = new OllamaClient(this.cache);
    this.useOllama = process.env.LLM_PROVIDER === 'ollama' || !this.apiKey;
  }

  public getDimension(): number {
    return this.dimension;
  }

  /**
   * Generates a normalized dense vector for the given text with Dragonfly caching.
   */
  public async embed(text: string): Promise<number[]> {
    // 1. Check Dragonfly cache first
    const cached = await this.cache.getCachedEmbedding(text);
    if (cached && cached.length === this.dimension) {
      return cached;
    }

    let vector: number[];

    // 2. Try Ollama local embedding (qwen3-embedding:8b)
    if (this.useOllama) {
      try {
        vector = await this.ollama.embed(text);
        if (vector && vector.length === this.dimension) {
          await this.cache.setCachedEmbedding(text, vector);
          return vector;
        }
      } catch {
        // Fallback to local deterministic generator
      }
    }

    // 3. Fallback to remote API if configured
    if (this.apiKey && process.env.USE_REMOTE_EMBEDDINGS === 'true') {
      try {
        vector = await this.embedRemote(text);
      } catch (err) {
        vector = this.embedLocal(text);
      }
    } else {
      vector = this.embedLocal(text);
    }

    // Cache in Dragonfly
    await this.cache.setCachedEmbedding(text, vector);
    return vector;
  }

  /**
   * Deterministic local embedding generator (1024 dimensions).
   */
  public embedLocal(text: string): number[] {
    const vector = new Array(this.dimension).fill(0);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const hash = this.murmurHash(token);
      const index = Math.abs(hash) % this.dimension;
      const sign = hash % 2 === 0 ? 1 : -1;
      vector[index] += sign * 1.5;

      if (token.length >= 3) {
        for (let j = 0; j <= token.length - 3; j++) {
          const gram = token.substring(j, j + 3);
          const gHash = this.murmurHash(gram);
          const gIndex = Math.abs(gHash) % this.dimension;
          vector[gIndex] += (gHash % 2 === 0 ? 1 : -1) * 0.4;
        }
      }
    }

    let norm = 0;
    for (let i = 0; i < this.dimension; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  private async embedRemote(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text.slice(0, 8000),
        model: 'text-embedding-3-small',
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API failed with status ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.data[0].embedding.slice(0, this.dimension);
  }

  private murmurHash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash;
  }

  public static cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }
}

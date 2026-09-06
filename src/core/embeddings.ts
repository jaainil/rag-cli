import crypto from 'crypto';

export class EmbeddingEngine {
  private dimension: number = 128;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || process.env.VOYAGE_API_KEY;
  }

  /**
   * Generates a normalized dense vector for the given text.
   * If an API key is provided, can query external embedding API.
   * Otherwise, generates a deterministic semantic character n-gram + token projection vector.
   */
  public async embed(text: string): Promise<number[]> {
    if (this.apiKey && process.env.USE_REMOTE_EMBEDDINGS === 'true') {
      try {
        return await this.embedRemote(text);
      } catch (err) {
        // Fall back to local generator if remote call fails
        return this.embedLocal(text);
      }
    }

    return this.embedLocal(text);
  }

  /**
   * Deterministic local embedding generator.
   * Uses hashing trick across subword n-grams and domain vocabulary to project
   * text into a unit-normalized dense float vector.
   */
  public embedLocal(text: string): number[] {
    const vector = new Array(this.dimension).fill(0);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);

    // 1. Token level features
    for (const token of tokens) {
      const hash = this.murmurHash(token);
      const index = Math.abs(hash) % this.dimension;
      const sign = hash % 2 === 0 ? 1 : -1;
      vector[index] += sign * 1.5;

      // 2. Character n-grams (3-grams) for morphological capture
      if (token.length >= 3) {
        for (let j = 0; j <= token.length - 3; j++) {
          const gram = token.substring(j, j + 3);
          const gHash = this.murmurHash(gram);
          const gIndex = Math.abs(gHash) % this.dimension;
          vector[gIndex] += (gHash % 2 === 0 ? 1 : -1) * 0.4;
        }
      }
    }

    // 3. Unit normalize
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
    return data.data[0].embedding;
  }

  private murmurHash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  public static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
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

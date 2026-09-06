import Redis from 'ioredis';
import crypto from 'crypto';

export class DragonflyCacheManager {
  private redis: Redis | null = null;
  private isConnected: boolean = false;
  private defaultTtl: number = 86400; // 24 hours

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL;
    if (!url) {
      this.isConnected = false;
      return;
    }
    try {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 2,
        connectTimeout: 4000,
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
      });

      this.redis.on('error', (err) => {
        // Log quietly and allow graceful degradation
        this.isConnected = false;
      });
    } catch {
      this.isConnected = false;
    }
  }

  public async connect(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      await this.redis.connect();
      this.isConnected = true;
      return true;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  private hashKey(prefix: string, content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 24);
    return `sop:${prefix}:${hash}`;
  }

  public async getCachedEmbedding(text: string): Promise<number[] | null> {
    if (!this.isConnected || !this.redis) return null;
    try {
      const key = this.hashKey('embed', text);
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public async setCachedEmbedding(text: string, vector: number[], ttl: number = this.defaultTtl): Promise<void> {
    if (!this.isConnected || !this.redis) return;
    try {
      const key = this.hashKey('embed', text);
      await this.redis.set(key, JSON.stringify(vector), 'EX', ttl);
    } catch {
      // Ignore cache write error
    }
  }

  public async getCachedQueryResult<T>(query: string): Promise<T | null> {
    if (!this.isConnected || !this.redis) return null;
    try {
      const key = this.hashKey('query', query);
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public async setCachedQueryResult<T>(query: string, value: T, ttl: number = 3600): Promise<void> {
    if (!this.isConnected || !this.redis) return;
    try {
      const key = this.hashKey('query', query);
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      // Ignore
    }
  }

  public async getCachedStats(): Promise<any | null> {
    if (!this.isConnected || !this.redis) return null;
    try {
      const data = await this.redis.get('sop:stats:overview');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public async setCachedStats(stats: any, ttl: number = 600): Promise<void> {
    if (!this.isConnected || !this.redis) return;
    try {
      await this.redis.set('sop:stats:overview', JSON.stringify(stats), 'EX', ttl);
    } catch {
      // Ignore
    }
  }

  public async invalidateStats(): Promise<void> {
    if (!this.isConnected || !this.redis) return;
    try {
      await this.redis.del('sop:stats:overview');
    } catch {
      // Ignore
    }
  }

  public async isHealthy(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const res = await this.redis.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  public disconnect(): void {
    if (this.redis) {
      try {
        this.redis.disconnect();
      } catch {
        // Ignore
      }
    }
  }
}

import fs from 'fs';
import path from 'path';
import os from 'os';
import { AppConfig } from '../types';

export class ConfigManager {
  private configPath: string;
  private config: AppConfig;

  constructor() {
    const configDir = path.join(os.homedir(), '.compliance-check');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.configPath = path.join(configDir, 'config.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    const defaults: AppConfig = {
      llmProvider:
        (process.env.LLM_PROVIDER as any) || 'openrouter',
      openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      openaiApiKey: process.env.OPENAI_API_KEY || '',
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      modelName: process.env.OPENROUTER_MODEL || 'meta/muse-spark-1.3-contributor',
      embeddingModel: process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small',
      rerankModel: process.env.OPENROUTER_RERANK_MODEL || 'voyageai/rerank-2.5',
      similarityThreshold: 0.6,
      vectorEngine: process.env.DATABASE_URL ? 'pgvector' : 'sqlite-local',
    };

    if (fs.existsSync(this.configPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        return { ...defaults, ...saved };
      } catch {
        return defaults;
      }
    }

    return defaults;
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public setConfigValue<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.config[key] = value;
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  public getConfigPath(): string {
    return this.configPath;
  }
}

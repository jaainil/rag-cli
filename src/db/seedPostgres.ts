import { PostgresManager } from './postgres';
import { generatePrecedents } from './seedData';
import { EmbeddingEngine } from '../core/embeddings';
import { DragonflyCacheManager } from '../cache/dragonfly';
import fs from 'fs';
import path from 'path';

export async function seedPostgres(): Promise<number> {
  const pg = new PostgresManager();
  const cache = new DragonflyCacheManager();
  await cache.connect();

  console.log(`Initializing PostgreSQL schema & pgvector extension on: ${pg.getConnectionString()}`);
  await pg.initSchema();

  const embedder = new EmbeddingEngine();

  // 1. Curated Warning Letters & 483s
  const curated = generatePrecedents();
  console.log(`Seeding ${curated.length} curated FDA Warning Letters & Form 483 citations into pgvector...`);
  await pg.insertPrecedents(curated, (text) => embedder.embedLocal(text));

  // 2. Also check if openFDA parsed JSON is available to seed real recalls!
  const recallJsonPath = path.resolve(process.cwd(), 'data', 'openfda_recalls_18yr_cgmp.json');
  if (fs.existsSync(recallJsonPath)) {
    console.log(`Loading openFDA 18-year recall records from ${recallJsonPath}...`);
    const recalls = JSON.parse(fs.readFileSync(recallJsonPath, 'utf-8'));
    console.log(`Seeding ${recalls.length} openFDA cGMP recall records into pgvector...`);
    await pg.insertPrecedents(recalls, (text) => embedder.embedLocal(text));
  }

  const count = await pg.getPrecedentCount();
  console.log(`✔ PostgreSQL pgvector ready with ${count} indexed records!`);

  // Warm up Dragonfly cache with initial stats
  if (await cache.isHealthy()) {
    await cache.setCachedStats({ totalPrecedents: count, timestamp: new Date().toISOString() });
    console.log(`✔ Dragonfly Redis cache warmed up.`);
  }

  cache.disconnect();
  await pg.close();
  return count;
}

if (require.main === module) {
  seedPostgres().catch((err) => {
    console.error('Postgres seeding failed:', err);
    process.exit(1);
  });
}

import { DatabaseManager } from './sqlite';
import { generatePrecedents } from './seedData';

import fs from 'fs';
import path from 'path';

export function seedDatabase(db: DatabaseManager): number {
  const currentCount = db.getPrecedentCount();
  if (currentCount >= 5000) {
    return currentCount;
  }

  const precedents = generatePrecedents();
  db.insertPrecedents(precedents);

  // Auto-ingest real 18-year openFDA cGMP records if available
  const recallJsonPath = path.resolve(__dirname, '../../data/openfda_recalls_18yr_cgmp.json');
  if (fs.existsSync(recallJsonPath)) {
    try {
      const raw = fs.readFileSync(recallJsonPath, 'utf-8');
      const recalls = JSON.parse(raw);
      db.insertPrecedents(recalls);
    } catch (e) {
      console.warn('Failed to auto-ingest 18-year openFDA records into SQLite:', e);
    }
  }

  return db.getPrecedentCount();
}

if (require.main === module) {
  const db = new DatabaseManager();
  console.log(`Checking precedent database at: ${db.getDbPath()}`);
  const count = seedDatabase(db);
  console.log(`Database ready with ${count} FDA precedent citations.`);
  db.close();
}

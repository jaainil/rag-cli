import { DatabaseManager } from './sqlite';
import { generatePrecedents } from './seedData';

export function seedDatabase(db: DatabaseManager): number {
  const currentCount = db.getPrecedentCount();
  if (currentCount >= 200) {
    return currentCount;
  }

  const precedents = generatePrecedents();
  db.insertPrecedents(precedents);
  return db.getPrecedentCount();
}

if (require.main === module) {
  const db = new DatabaseManager();
  console.log(`Checking precedent database at: ${db.getDbPath()}`);
  const count = seedDatabase(db);
  console.log(`Database ready with ${count} FDA precedent citations.`);
  db.close();
}

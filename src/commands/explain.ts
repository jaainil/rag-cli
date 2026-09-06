import chalk from 'chalk';
import { DatabaseManager } from '../db/sqlite';
import { ReportRenderer } from '../core/reportRenderer';

export function handleExplain(sectionQuery: string): void {
  const db = new DatabaseManager();
  const latestReport = db.getLatestScanReport();

  if (!latestReport) {
    console.log(chalk.red('\nNo recent scan report found in local database.'));
    console.log(chalk.gray('Please run a scan first: ') + chalk.cyan('compliance-check scan <file.pdf>\n'));
    process.exit(1);
  }

  const cleanQuery = sectionQuery.replace(/section/i, '').trim().toLowerCase();

  const matchedFlag = latestReport.flags.find((f) => {
    const fRef = f.sectionRef.toLowerCase().trim();
    const fId = f.id.toLowerCase().trim();
    return (
      fRef === cleanQuery ||
      fId === cleanQuery ||
      fRef.includes(cleanQuery) ||
      cleanQuery.includes(fRef)
    );
  });

  if (!matchedFlag) {
    console.log(
      chalk.yellow(`\nSection "${sectionQuery}" was not flagged in the latest scan of "${latestReport.filename}".`)
    );
    console.log(chalk.gray('Available flagged sections in this report:'));
    for (const f of latestReport.flags) {
      console.log(`  - Section ${chalk.cyan(f.sectionRef)} (${f.riskLevel}): ${f.sectionTitle}`);
    }
    console.log('');
    process.exit(0);
  }

  // Find original section text if available
  const originalSection = latestReport.sections.find((s) => s.sectionNumber === matchedFlag.sectionRef);
  const sectionContent = originalSection ? originalSection.content : undefined;

  ReportRenderer.renderExplanation(matchedFlag, sectionContent);
}

import chalk from 'chalk';
import Table from 'cli-table3';
import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../db/sqlite';

export function handleReview(
  flagId: string,
  options: { accept?: boolean; reject?: boolean; note?: string }
): void {
  const db = new DatabaseManager();

  if (!options.accept && !options.reject) {
    console.log(chalk.red('Please specify either --accept or --reject.'));
    console.log(chalk.gray('Example: compliance-check review 4.2 --accept --note "Valid deviation timeline observation"'));
    process.exit(1);
  }

  const decision = options.accept ? 'accept' : 'reject';
  db.logReview(flagId, decision, options.note);

  console.log(chalk.green.bold('\n✔ Expert Review Feedback Logged'));
  console.log(`  ${chalk.gray('Target Flag:')}   ${chalk.white.bold(flagId)}`);
  console.log(`  ${chalk.gray('Decision:')}      ${decision === 'accept' ? chalk.green.bold('ACCEPTED (True Positive)') : chalk.red.bold('REJECTED (False Positive)')}`);
  if (options.note) {
    console.log(`  ${chalk.gray('QA Note:')}       ${chalk.italic(options.note)}`);
  }
  console.log(chalk.gray('  Retrieval ranking weight updated in continuous learning loop.\n'));
}

export function handleDatasetStats(): void {
  const db = new DatabaseManager();
  const precedents = db.getAllPrecedents();

  if (precedents.length === 0) {
    console.log(chalk.yellow('Knowledge base is currently empty. Run a scan to seed automatically.'));
    return;
  }

  const categoryMap = new Map<string, number>();
  const severityMap = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  let minYear = 9999;
  let maxYear = 0;

  for (const p of precedents) {
    categoryMap.set(p.category, (categoryMap.get(p.category) || 0) + 1);
    if (p.severity in severityMap) {
      severityMap[p.severity as keyof typeof severityMap]++;
    }
    const yr = parseInt(p.date_issued.split('-')[0], 10);
    if (!isNaN(yr)) {
      if (yr < minYear) minYear = yr;
      if (yr > maxYear) maxYear = yr;
    }
  }

  console.log(chalk.bold.white('\nFDA Precedent Knowledge Base Statistics'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(`Total Precedents:    ${chalk.bold.green(precedents.length)} citations indexed`);
  console.log(`Date Range:          ${chalk.cyan(`${minYear} – ${maxYear}`)}`);
  console.log(`Severity:            ${chalk.red.bold(`${severityMap.HIGH} High`)}  |  ${chalk.yellow.bold(`${severityMap.MEDIUM} Medium`)}  |  ${chalk.blue.bold(`${severityMap.LOW} Low`)}\n`);

  const table = new Table({
    head: [chalk.cyan('Category / cGMP Focus Area'), chalk.cyan('Records')],
    colWidths: [45, 12],
  });

  for (const [cat, count] of categoryMap.entries()) {
    table.push([cat, count.toString()]);
  }

  console.log(table.toString());
  console.log(chalk.dim('\nRecent Precedent Additions:'));
  const recents = precedents.slice(0, 3);
  recents.forEach((r) => {
    console.log(`  • ${chalk.yellow(r.source)}: ${r.issue_summary.slice(0, 75)}...`);
  });
  console.log('');
}

export function handleDatasetAdd(filePath: string): void {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.log(chalk.red(`File not found: ${filePath}`));
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(raw);
    const db = new DatabaseManager();

    const items = Array.isArray(parsed) ? parsed : [parsed];
    db.insertPrecedents(items);
    console.log(chalk.green.bold(`✔ Successfully ingested ${items.length} new precedent(s) into knowledge base.\n`));
  } catch (err: any) {
    console.log(chalk.red(`Failed to ingest precedent: ${err.message}`));
    process.exit(1);
  }
}

export function handleHistory(filename?: string): void {
  const db = new DatabaseManager();
  const history = db.getScanHistory(filename);

  if (history.length === 0) {
    console.log(chalk.yellow('\nNo prior scan history found in local database.\n'));
    return;
  }

  console.log(chalk.bold.white('\nSOP Compliance Scan Audit History'));
  console.log(chalk.gray('─'.repeat(75)));

  const table = new Table({
    head: [
      chalk.cyan('Scan Date (UTC)'),
      chalk.cyan('SOP Filename'),
      chalk.cyan('Sections'),
      chalk.cyan('Total Flags'),
      chalk.cyan('High / Med / Low'),
    ],
    colWidths: [22, 30, 10, 13, 18],
  });

  for (const h of history) {
    table.push([
      new Date(h.scanned_at).toISOString().replace('T', ' ').slice(0, 19),
      h.sop_filename.length > 27 ? h.sop_filename.slice(0, 24) + '...' : h.sop_filename,
      h.section_count.toString(),
      h.flag_count.toString(),
      `${chalk.red(h.high_count)} / ${chalk.yellow(h.medium_count)} / ${chalk.blue(h.low_count)}`,
    ]);
  }

  console.log(table.toString());
  console.log('');
}

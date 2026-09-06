import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { DatabaseManager } from '../db/sqlite';
import { seedDatabase } from '../db/seedRunner';
import { parseDocument } from '../core/parser';
import { extractSections } from '../core/chunker';
import { HybridRetriever } from '../core/hybridRetriever';
import { RegulatoryReasoningEngine } from '../core/reasoningEngine';
import { ReportRenderer } from '../core/reportRenderer';
import { ConfigManager } from '../utils/configManager';
import { ScanReport, FlaggedIssue } from '../types';

export async function handleScan(
  targetPath: string,
  options: { export?: string; output?: string }
): Promise<ScanReport> {
  const startTime = Date.now();
  const db = new DatabaseManager();
  const config = new ConfigManager().getConfig();

  // Ensure knowledge base has 200+ precedents seeded
  seedDatabase(db);
  const precedents = db.getAllPrecedents();

  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    console.error(chalk.red(`Error: Target file or directory not found: ${targetPath}`));
    process.exit(1);
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return handleDirectoryScan(resolved, precedents, db, config);
  }

  // 1. Loading SOP
  const loadSpinner = ora({ text: 'Loading SOP...', color: 'cyan' }).start();
  let parsedDoc;
  try {
    parsedDoc = await parseDocument(resolved);
    loadSpinner.succeed(`Loading SOP...                     ${chalk.green('done')} (${(parsedDoc.fileSize / 1024).toFixed(1)} KB)`);
  } catch (err: any) {
    loadSpinner.fail(`Failed to load SOP: ${err.message}`);
    process.exit(1);
  }

  // 2. Parsing sections
  const parseSpinner = ora({ text: 'Parsing sections...', color: 'cyan' }).start();
  const sections = extractSections(parsedDoc.rawText);
  parseSpinner.succeed(`Parsing sections...                ${chalk.green(`${sections.length} sections found`)}`);

  // 3. Embedding + retrieving matches
  const retrieveSpinner = ora({ text: 'Embedding + retrieving matches...', color: 'cyan' }).start();
  const retriever = new HybridRetriever(precedents);
  const reasoningEngine = new RegulatoryReasoningEngine(config.llmProvider, config.anthropicApiKey || config.openaiApiKey);
  retrieveSpinner.succeed(`Embedding + retrieving matches...  ${chalk.green('done')} (${precedents.length} FDA precedents indexed)`);

  // 4. Running risk analysis
  const analyzeSpinner = ora({ text: 'Running risk analysis...', color: 'cyan' }).start();
  const flags: FlaggedIssue[] = [];

  for (const section of sections) {
    const retrievals = await retriever.retrieveMatches(section, 3);
    const issue = await reasoningEngine.analyzeSection(section, retrievals);
    if (issue) {
      flags.push(issue);
    }
  }

  analyzeSpinner.succeed(`Running risk analysis...           ${chalk.green('done')}`);

  const highCount = flags.filter((f) => f.riskLevel === 'HIGH').length;
  const mediumCount = flags.filter((f) => f.riskLevel === 'MEDIUM').length;
  const lowCount = flags.filter((f) => f.riskLevel === 'LOW').length;

  const report: ScanReport = {
    id: `SCAN-${Date.now()}`,
    filename: parsedDoc.filename,
    fileHash: parsedDoc.fileHash,
    scannedAt: new Date().toISOString(),
    sectionCount: sections.length,
    flagCount: flags.length,
    highCount,
    mediumCount,
    lowCount,
    sections,
    flags,
    executionTimeMs: Date.now() - startTime,
  };

  // Save to local SQLite audit store
  db.saveScanReport(report);

  // Render to terminal
  ReportRenderer.renderTerminalReport(report);

  // Optional direct export if flag passed
  if (options.export) {
    const fmt = options.export.toLowerCase() as 'json' | 'csv' | 'html';
    const { ReportExporter } = require('../core/exporter');
    const out = ReportExporter.exportReport(report, fmt, options.output);
    console.log(chalk.green(`  ✔ Report exported to: ${chalk.bold(out)}\n`));
  }

  return report;
}

async function handleDirectoryScan(
  dirPath: string,
  precedents: any[],
  db: DatabaseManager,
  config: any
): Promise<ScanReport> {
  console.log(chalk.cyan(`Scanning directory: ${dirPath}\n`));
  const files = fs.readdirSync(dirPath).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ['.md', '.txt', '.pdf', '.docx'].includes(ext);
  });

  if (files.length === 0) {
    console.log(chalk.yellow('No supported SOP files (.pdf, .docx, .txt, .md) found in directory.'));
    process.exit(0);
  }

  console.log(chalk.white(`Found ${files.length} SOP documents. Processing batch...\n`));
  let totalSections = 0;
  let totalFlags = 0;
  let lastReport: any = null;

  for (const f of files) {
    console.log(chalk.bold.cyan(`▶ ${f}`));
    const report = await handleScan(path.join(dirPath, f), {});
    totalSections += report.sectionCount;
    totalFlags += report.flagCount;
    lastReport = report;
  }

  console.log(chalk.green.bold(`\nBatch scan complete: ${files.length} files, ${totalSections} sections scanned, ${totalFlags} total flags logged.`));
  return lastReport;
}

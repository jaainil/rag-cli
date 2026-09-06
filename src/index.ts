import { Command } from 'commander';
import { handleScan } from './commands/scan';
import { handleExplain } from './commands/explain';
import { handleExport } from './commands/export';
import { handleConfig } from './commands/config';
import { handleReview, handleDatasetStats, handleDatasetAdd, handleHistory } from './commands/stubs';
import { ComplianceChatBot } from './interactive/chatBot';

const program = new Command();

program
  .name('compliance-check')
  .description('Pharma SOP Regulatory Risk Checker — Evaluates SOPs against historical FDA citations & cGMP regulations')
  .version('1.0.0');

// 0. Interactive Chat Command (OpenCode style)
program
  .command('chat')
  .description('Start interactive compliance chatbot session (default when no args provided)')
  .action(async () => {
    try {
      const bot = new ComplianceChatBot();
      await bot.start();
    } catch (err: any) {
      console.error(`Chatbot error: ${err.message}`);
      process.exit(1);
    }
  });

// 1. Scan Command
program
  .command('scan <target>')
  .description('Run compliance scan on a single SOP file (.pdf, .docx, .txt, .md) or directory')
  .option('-e, --export <format>', 'Export format immediately after scan (json, csv, html)')
  .option('-o, --output <path>', 'Custom destination path for exported report')
  .action(async (target, options) => {
    try {
      await handleScan(target, options);
    } catch (err: any) {
      console.error(`Scan failed: ${err.message}`);
      process.exit(1);
    }
  });

// 2. Explain Command
program
  .command('explain <section>')
  .description('Deep regulatory reasoning, statutory citations, and remediation guidance for a flagged section')
  .action((section) => {
    try {
      handleExplain(section);
    } catch (err: any) {
      console.error(`Explain failed: ${err.message}`);
      process.exit(1);
    }
  });

// 3. Export Command
program
  .command('export')
  .description('Export the most recent scan report to a file')
  .option('-f, --format <format>', 'Export format (json, csv, html)', 'json')
  .option('-o, --output <path>', 'Custom output file path')
  .action((options) => {
    try {
      handleExport(options);
    } catch (err: any) {
      console.error(`Export failed: ${err.message}`);
      process.exit(1);
    }
  });

// 4. Review Command (Continuous Retrieval Learning Loop)
program
  .command('review <flag_id>')
  .description('Record human-in-the-loop expert review (accept/reject) to adjust retrieval weights')
  .option('--accept', 'Accept flag as a valid true-positive risk')
  .option('--reject', 'Reject flag as a false positive')
  .option('--note <note>', 'Auditor commentary or rationale')
  .action((flagId, options) => {
    try {
      handleReview(flagId, options);
    } catch (err: any) {
      console.error(`Review failed: ${err.message}`);
      process.exit(1);
    }
  });

// 5. History Command
program
  .command('history [file]')
  .description('Display historical audit records and compliance progression for SOPs')
  .action((file) => {
    try {
      handleHistory(file);
    } catch (err: any) {
      console.error(`History failed: ${err.message}`);
      process.exit(1);
    }
  });

// 6. Dataset Subcommands
const datasetCmd = program.command('dataset').description('Manage the FDA precedent knowledge base');

datasetCmd
  .command('stats')
  .description('Display knowledge base metrics, category distributions, and date ranges')
  .action(() => {
    try {
      handleDatasetStats();
    } catch (err: any) {
      console.error(`Dataset stats failed: ${err.message}`);
      process.exit(1);
    }
  });

datasetCmd
  .command('add <file>')
  .description('Ingest new FDA warning letters or audit observations into the knowledge base')
  .action((file) => {
    try {
      handleDatasetAdd(file);
    } catch (err: any) {
      console.error(`Dataset add failed: ${err.message}`);
      process.exit(1);
    }
  });

datasetCmd
  .command('pull-openfda')
  .description('Download and parse 18+ years of openFDA drug enforcement recall records into clean cGMP JSON')
  .option('-l, --limit <count>', 'Maximum number of cGMP records to transform', '2000')
  .option('-s, --seed', 'Seed parsed records directly into SQLite knowledge base')
  .action(async (options) => {
    try {
      const { runIngestion } = require('./ingest/openfda_recalls');
      await runIngestion({
        maxRecords: parseInt(options.limit, 10),
        seedDb: options.seed,
      });
    } catch (err: any) {
      console.error(`openFDA ingestion failed: ${err.message}`);
      process.exit(1);
    }
  });

// 7. Config Command
const configCmd = program
  .command('config [action] [key] [value]')
  .description('View or update CLI settings (API keys, LLM provider, similarity thresholds)')
  .action((action, key, value) => {
    try {
      if (action === 'set' && key && value !== undefined) {
        handleConfig(key, value);
      } else if (action && !key && !value) {
        handleConfig(action, undefined);
      } else {
        handleConfig();
      }
    } catch (err: any) {
      console.error(`Config failed: ${err.message}`);
      process.exit(1);
    }
  });

// If launched without CLI subcommands, start interactive chatbot (OpenCode style)
if (process.argv.slice(2).length === 0) {
  const bot = new ComplianceChatBot();
  bot.start();
} else {
  program.parse(process.argv);
}

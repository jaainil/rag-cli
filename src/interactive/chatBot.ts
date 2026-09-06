import readline from 'readline';
import chalk from 'chalk';
import boxen from 'boxen';
import path from 'path';
import fs from 'fs';
import { DatabaseManager } from '../db/sqlite';
import { PostgresManager } from '../db/postgres';
import { DragonflyCacheManager } from '../cache/dragonfly';
import { seedDatabase } from '../db/seedRunner';
import { handleScan } from '../commands/scan';
import { handleExplain } from '../commands/explain';
import { handleExport } from '../commands/export';
import { handleReview, handleDatasetStats, handleHistory } from '../commands/stubs';
import { HybridRetriever } from '../core/hybridRetriever';
import { ConfigManager } from '../utils/configManager';
import { ScanReport } from '../types';

export class ComplianceChatBot {
  private db: DatabaseManager;
  private pg: PostgresManager;
  private cache: DragonflyCacheManager;
  private configManager: ConfigManager;
  private lastReport: ScanReport | null = null;
  private activeSopPath: string | null = null;
  private isRunning: boolean = false;
  private isPgConnected: boolean = false;
  private isCacheConnected: boolean = false;

  constructor() {
    this.db = new DatabaseManager();
    seedDatabase(this.db);
    this.pg = new PostgresManager();
    this.cache = new DragonflyCacheManager();
    this.configManager = new ConfigManager();
    this.lastReport = this.db.getLatestScanReport();
  }

  public async start(): Promise<void> {
    this.isRunning = true;

    try {
      this.isCacheConnected = await this.cache.connect();
    } catch {
      this.isCacheConnected = false;
    }

    try {
      const count = await this.pg.getPrecedentCount();
      this.isPgConnected = count > 0;
    } catch {
      this.isPgConnected = false;
    }

    await this.renderWelcomeBanner();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan.bold('compliance-check ❯ '),
    });

    rl.prompt();

    rl.on('line', async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) {
        rl.prompt();
        return;
      }

      rl.pause();
      try {
        await this.handleInput(trimmed, rl);
      } catch (err: any) {
        console.log(chalk.red(`\nError: ${err.message}\n`));
      } finally {
        if (this.isRunning) {
          rl.resume();
          rl.prompt();
        }
      }
    });

    rl.on('close', () => {
      this.isRunning = false;
      this.cache.disconnect();
      console.log(chalk.yellow('\nExiting Compliance CLI. Goodbye!\n'));
    });
  }

  private async renderWelcomeBanner(): Promise<void> {
    if (process.stdout.isTTY) {
      console.clear();
    }
    const banner = chalk.bold.cyan(`
 ██████╗ ██████╗ ███╗   ███╗██████╗ ██╗     ██╗ █████╗ ███╗   ██╗ ██████╗███████╗
██╔════╝██╔═══██╗████╗ ████║██╔══██╗██║     ██║██╔══██╗████╗  ██║██╔════╝██╔════╝
██║     ██║   ██║██╔████╔██║██████╔╝██║     ██║███████║██╔██╗ ██║██║     █████╗  
██║     ██║   ██║██║╚██╔╝██║██╔═══╝ ██║     ██║██╔══██║██║╚██╗██║██║     ██╔══╝  
╚██████╗╚██████╔╝██║ ╚═╝ ██║██║     ███████╗██║██║  ██║██║ ╚████║╚██████╗███████╗
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚══════╝╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝
                                                     PHARMA SOP REGULATORY AUDITOR
    `);

    console.log(banner);

    const config = this.configManager.getConfig();
    let count = this.db.getPrecedentCount();
    if (this.isPgConnected) {
      try {
        count = await this.pg.getPrecedentCount();
      } catch {
        // use sqlite count
      }
    }

    const dbStatus = this.isPgConnected
      ? chalk.green('PostgreSQL 18 (pgvector) [Connected]')
      : chalk.yellow('SQLite Local');

    const cacheStatus = this.isCacheConnected
      ? chalk.green('Dragonfly Redis [Active]')
      : chalk.dim('Memory / Disabled');

    const statusCard = [
      `${chalk.bold.white('Interactive Compliance Chatbot')}  ${chalk.dim('(OpenCode style)')}`,
      `${chalk.green('●')} ${chalk.gray('Database:')} ${dbStatus}  |  ${chalk.gray('Cache:')} ${cacheStatus}`,
      `${chalk.green('●')} ${chalk.gray('Knowledge Base:')} ${chalk.cyan.bold(`${count} FDA Precedents`)}  |  ${chalk.gray('Reasoning:')} ${chalk.yellow(config.llmProvider.toUpperCase())}`,
      this.lastReport
        ? `${chalk.gray('Active SOP:')} ${chalk.white.bold(this.lastReport.filename)} (${this.lastReport.flagCount} flags logged)`
        : `${chalk.gray('Active SOP:')} ${chalk.dim('None (type /scan <file> or drop an SOP to begin)')}`,
    ].join('\n');

    console.log(
      boxen(statusCard, {
        padding: { top: 0, bottom: 0, left: 2, right: 2 },
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderColor: 'cyan',
        borderStyle: 'round',
      })
    );

    console.log(chalk.gray('Type natural questions (e.g. ') + chalk.white('"What are FDA rules for cleaning hold times?"') + chalk.gray(') or slash commands:'));
    console.log(chalk.dim('  /scan <file>      Scan an SOP file (.pdf, .docx, .md, .txt)'));
    console.log(chalk.dim('  /explain <sec>    Deep dive into a flagged section (e.g. /explain 4.2)'));
    console.log(chalk.dim('  /export [format]  Export report to json, csv, or html'));
    console.log(chalk.dim('  /review <flag>    Review a flag (--accept or --reject)'));
    console.log(chalk.dim('  /stats            Show FDA precedent database metrics'));
    console.log(chalk.dim('  /history          View audit history log'));
    console.log(chalk.dim('  /clear            Clear chat screen'));
    console.log(chalk.dim('  /help             Display available commands'));
    console.log(chalk.dim('  /exit             Exit chat\n'));
  }

  private async handleInput(input: string, rl: readline.Interface): Promise<void> {
    const trimmed = input.trim();

    if (trimmed.startsWith('/')) {
      await this.handleSlashCommand(trimmed, rl);
      return;
    }

    const lower = trimmed.toLowerCase();

    if (lower === 'exit' || lower === 'quit' || lower === 'q') {
      rl.close();
      return;
    }

    if (lower === 'clear' || lower === 'cls') {
      await this.renderWelcomeBanner();
      return;
    }

    if (lower === 'help') {
      this.showHelp();
      return;
    }

    // Natural scan trigger
    if (lower.startsWith('scan ') || lower.startsWith('check ') || lower.startsWith('audit ')) {
      const parts = trimmed.split(/\s+/);
      if (parts[1]) {
        await this.executeScan(parts[1]);
        return;
      }
    }

    // Natural explain trigger
    if (lower.startsWith('explain ') || lower.includes('why was section ') || lower.includes('why is section ')) {
      const match = trimmed.match(/(?:explain|section)\s+([0-9]+(?:\.[0-9]+)*)/i);
      if (match && match[1]) {
        handleExplain(match[1]);
        return;
      }
    }

    // Natural export trigger
    if (lower.startsWith('export') || lower.startsWith('save report')) {
      const format = lower.includes('csv') ? 'csv' : lower.includes('html') ? 'html' : 'json';
      handleExport({ format });
      return;
    }

    // Natural review trigger
    if (lower.startsWith('accept ') || lower.startsWith('reject ')) {
      const parts = trimmed.split(/\s+/);
      const isAccept = parts[0].toLowerCase() === 'accept';
      const flagRef = parts[1];
      if (flagRef) {
        handleReview(flagRef, isAccept ? { accept: true } : { reject: true });
        return;
      }
    }

    // Conversational Regulatory Expert Q&A against PostgreSQL pgvector + Dragonfly cache
    await this.answerRegulatoryQuestion(trimmed);
  }

  private async handleSlashCommand(cmd: string, rl: readline.Interface): Promise<void> {
    const [command, ...args] = cmd.split(/\s+/);

    switch (command.toLowerCase()) {
      case '/exit':
      case '/quit':
        rl.close();
        break;

      case '/clear':
        await this.renderWelcomeBanner();
        break;

      case '/help':
        this.showHelp();
        break;

      case '/stats':
        handleDatasetStats();
        break;

      case '/history':
        handleHistory(args[0]);
        break;

      case '/scan':
        if (!args[0]) {
          console.log(chalk.yellow('Usage: /scan <path/to/sop.pdf|md|txt|docx>'));
          if (fs.existsSync('sample_sops')) {
            console.log(chalk.gray('Available sample SOPs:'));
            const files = fs.readdirSync('sample_sops');
            files.forEach((f) => console.log(`  sample_sops/${f}`));
          }
        } else {
          await this.executeScan(args[0]);
        }
        break;

      case '/explain':
        if (!args[0]) {
          console.log(chalk.yellow('Usage: /explain <section_number> (e.g. /explain 4.2)'));
        } else {
          handleExplain(args[0]);
        }
        break;

      case '/export':
        const format = (args[0] || 'json').toLowerCase();
        handleExport({ format });
        break;

      case '/review':
        if (args.length < 2) {
          console.log(chalk.yellow('Usage: /review <section|flag_id> --accept|--reject [--note "..."]'));
        } else {
          const flagId = args[0];
          const isAccept = args.includes('--accept');
          const isReject = args.includes('--reject');
          const noteIndex = args.indexOf('--note');
          const note = noteIndex !== -1 ? args.slice(noteIndex + 1).join(' ').replace(/^["']|["']$/g, '') : undefined;
          handleReview(flagId, { accept: isAccept, reject: isReject, note });
        }
        break;

      default:
        console.log(chalk.yellow(`Unknown command "${command}". Type /help to see available commands.\n`));
    }
  }

  private async executeScan(filePath: string): Promise<void> {
    try {
      this.lastReport = await handleScan(filePath, {});
      this.activeSopPath = filePath;
    } catch (err: any) {
      console.log(chalk.red(`Scan failed: ${err.message}\n`));
    }
  }

  private async answerRegulatoryQuestion(question: string): Promise<void> {
    let precedents = this.db.getAllPrecedents();
    if (this.isPgConnected) {
      try {
        precedents = await this.pg.getAllPrecedents();
      } catch {
        // fallback
      }
    }

    const retriever = new HybridRetriever(
      precedents,
      undefined,
      this.isPgConnected ? this.pg : undefined,
      this.cache
    );

    console.log(chalk.dim('\nSearching FDA Warning Letters, 483 Observations, and 21 CFR guidelines (pgvector + Dragonfly cache)...'));

    const pseudoSection = {
      sectionNumber: 'QUERY',
      title: question,
      content: question,
      startLine: 1,
      wordCount: question.split(/\s+/).length,
      keyEntities: [],
    };

    const matches = await retriever.retrieveMatches(pseudoSection, 3);

    if (matches.length === 0) {
      console.log(chalk.yellow('\nNo direct FDA precedent found matching your query. Try asking about deviation timelines, cleaning hold times, data integrity, or environmental monitoring.\n'));
      return;
    }

    const top = matches[0].precedent;
    const top2 = matches[1]?.precedent;

    const answerBox = [
      `${chalk.bold.cyan('FDA Regulatory Guidance & Precedent Rationale')}`,
      `${chalk.gray('Applicable Statute:')} ${chalk.magenta.bold(top.cfr_citation)} (${top.category})`,
      `${chalk.gray('Regulatory Severity:')} ${top.severity === 'HIGH' ? chalk.red.bold('HIGH RISK (Warning Letter / Class I Recall)') : chalk.yellow.bold('MEDIUM RISK (483 Observation / Class II)')}`,
      '',
      chalk.bold.white('Precedent Finding:'),
      chalk.white(`  ${top.issue_summary}`),
      '',
      chalk.bold.white('Historical FDA Citation Excerpt:'),
      chalk.italic.gray(`  "${top.excerpt.slice(0, 240)}..."`),
      chalk.dim(`  — ${top.source} (${top.company_redacted})`),
      '',
      chalk.bold.white('Auditor Remediation & Industry Standard:'),
      chalk.greenBright(`  ${top.remediation_guidance}`),
    ];

    if (top2 && top2.id !== top.id) {
      answerBox.push(
        '',
        chalk.gray('Related Precedent:'),
        chalk.dim(`  • ${top2.source}: ${top2.issue_summary.slice(0, 90)}...`)
      );
    }

    console.log(
      boxen(answerBox.join('\n'), {
        padding: 1,
        borderColor: 'cyan',
        borderStyle: 'round',
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
      })
    );
  }

  private showHelp(): void {
    console.log(chalk.bold.white('\nAvailable Commands & Conversational Capabilities:'));
    console.log(chalk.gray('─'.repeat(65)));
    console.log(`  ${chalk.cyan('/scan <file>')}          Scan an SOP file (.pdf, .docx, .md, .txt)`);
    console.log(`  ${chalk.cyan('/explain <section>')}    Deep dive into a finding (e.g. /explain 4.2)`);
    console.log(`  ${chalk.cyan('/export [format]')}      Export report to json, csv, or html`);
    console.log(`  ${chalk.cyan('/review <flag>')}        Log human-in-the-loop review (--accept/--reject)`);
    console.log(`  ${chalk.cyan('/stats')}                View FDA precedent database statistics`);
    console.log(`  ${chalk.cyan('/history')}              View past scan history`);
    console.log(`  ${chalk.cyan('/clear')}                Clear the screen`);
    console.log(`  ${chalk.cyan('/exit')}                 Exit the chatbot`);
    console.log('');
    console.log(chalk.bold.white('Natural Questions You Can Ask:'));
    console.log(chalk.dim('  • "What are the FDA requirements for deviation investigations?"'));
    console.log(chalk.dim('  • "What is maximum dirty hold time under 21 CFR 211.67?"'));
    console.log(chalk.dim('  • "Can operators share administrator logins on QC instruments?"'));
    console.log(chalk.dim('  • "Scan sample_sops/sop_deviation_handling.md"'));
    console.log(chalk.dim('  • "Explain section 4.2"'));
    console.log(chalk.dim('  • "Export report as csv"\n'));
  }
}

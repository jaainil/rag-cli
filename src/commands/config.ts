import chalk from 'chalk';
import boxen from 'boxen';
import { ConfigManager } from '../utils/configManager';
import { DatabaseManager } from '../db/sqlite';
import { PostgresManager } from '../db/postgres';
import { DragonflyCacheManager } from '../cache/dragonfly';

export async function handleConfig(key?: string, value?: string): Promise<void> {
  const configManager = new ConfigManager();
  const db = new DatabaseManager();
  const pg = new PostgresManager();
  const cache = new DragonflyCacheManager();

  if (key && value !== undefined) {
    const validKeys = [
      'llmProvider',
      'anthropicApiKey',
      'openaiApiKey',
      'geminiApiKey',
      'modelName',
      'similarityThreshold',
      'vectorEngine',
      'qdrantUrl',
    ];

    if (!validKeys.includes(key)) {
      console.log(chalk.red(`Invalid configuration key "${key}". Valid keys are: ${validKeys.join(', ')}`));
      process.exit(1);
    }

    let parsedVal: any = value;
    if (key === 'similarityThreshold') {
      parsedVal = parseFloat(value);
      if (isNaN(parsedVal) || parsedVal < 0 || parsedVal > 1) {
        console.log(chalk.red('similarityThreshold must be a float between 0.0 and 1.0'));
        process.exit(1);
      }
    }

    configManager.setConfigValue(key as any, parsedVal);
    console.log(chalk.green(`✔ Configuration updated: ${chalk.bold(key)} = ${chalk.cyan(value)}`));
    return;
  }

  // Probe live connections
  let pgStatus = chalk.yellow('Testing...');
  let pgCount = 0;
  try {
    pgCount = await pg.getPrecedentCount();
    pgStatus = chalk.green.bold('Connected (PostgreSQL 18 + pgvector)');
  } catch (err: any) {
    pgStatus = chalk.red(`Disconnected (${err.message})`);
  }

  let cacheStatus = chalk.yellow('Testing...');
  try {
    const ok = await cache.isHealthy();
    cacheStatus = ok ? chalk.green.bold('Connected (Dragonfly Redis Active)') : chalk.dim('Disconnected');
  } catch {
    cacheStatus = chalk.dim('Disconnected');
  }

  const config = configManager.getConfig();
  const mask = (s?: string) => (s && s.length > 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : chalk.dim('(not set)'));

  const pgDisplay = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')
    : chalk.dim('(not configured)');

  const redisDisplay = process.env.REDIS_URL
    ? process.env.REDIS_URL.replace(/:[^:@]+@/, ':****@')
    : chalk.dim('(not configured)');

  const info = [
    chalk.bold.white('Pharma Compliance CLI Enterprise Configuration'),
    `${chalk.gray('Primary Database:')} ${pgDisplay}`,
    `${chalk.gray('Database Status:')}  ${pgStatus} (${pgCount} records)`,
    `${chalk.gray('Cache Store:')}       ${redisDisplay}`,
    `${chalk.gray('Cache Status:')}      ${cacheStatus}`,
    `${chalk.gray('Local Fallback:')}    ${chalk.cyan(db.getDbPath())}`,
    '',
    `${chalk.gray('LLM Reasoning:')}    ${chalk.yellow.bold(config.llmProvider)}`,
    `${chalk.gray('Anthropic Key:')}    ${mask(config.anthropicApiKey)}`,
    `${chalk.gray('OpenAI Key:')}       ${mask(config.openaiApiKey)}`,
    `${chalk.gray('Model Choice:')}     ${config.modelName || 'claude-3-5-sonnet-20241022'}`,
    `${chalk.gray('Sim Threshold:')}    ${chalk.bold(config.similarityThreshold)}`,
  ].join('\n');

  console.log(
    boxen(info, {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderColor: 'cyan',
      borderStyle: 'round',
    })
  );

  console.log(chalk.dim('To change an LLM setting:'));
  console.log(chalk.dim('  compliance-check config set llmProvider anthropic'));
  console.log(chalk.dim('  compliance-check config set anthropicApiKey sk-ant-...'));
  console.log(chalk.dim('  compliance-check config set similarityThreshold 0.65\n'));

  cache.disconnect();
  try {
    await pg.close();
  } catch {
    // Ignore
  }
}

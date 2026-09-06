import chalk from 'chalk';
import boxen from 'boxen';
import { ConfigManager } from '../utils/configManager';
import { DatabaseManager } from '../db/sqlite';

export function handleConfig(key?: string, value?: string): void {
  const configManager = new ConfigManager();
  const db = new DatabaseManager();

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

  // Display current configuration
  const config = configManager.getConfig();
  const mask = (s?: string) => (s && s.length > 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : chalk.dim('(not set)'));

  const info = [
    chalk.bold.white('Pharma Compliance CLI Configuration'),
    `${chalk.gray('Config File:')}     ${chalk.cyan(configManager.getConfigPath())}`,
    `${chalk.gray('Database Path:')}   ${chalk.cyan(db.getDbPath())}`,
    `${chalk.gray('Precedents:')}      ${chalk.bold(db.getPrecedentCount())} indexed FDA records`,
    '',
    `${chalk.gray('LLM Provider:')}    ${chalk.yellow.bold(config.llmProvider)}`,
    `${chalk.gray('Anthropic Key:')}   ${mask(config.anthropicApiKey)}`,
    `${chalk.gray('OpenAI Key:')}      ${mask(config.openaiApiKey)}`,
    `${chalk.gray('Gemini Key:')}      ${mask(config.geminiApiKey)}`,
    `${chalk.gray('Model Choice:')}    ${config.modelName || 'claude-3-5-sonnet-20241022'}`,
    `${chalk.gray('Vector Engine:')}   ${chalk.cyan(config.vectorEngine)}`,
    `${chalk.gray('Sim Threshold:')}   ${chalk.bold(config.similarityThreshold)}`,
  ].join('\n');

  console.log(
    boxen(info, {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderColor: 'blue',
      borderStyle: 'round',
    })
  );

  console.log(chalk.dim('To change a setting:'));
  console.log(chalk.dim('  compliance-check config set llmProvider anthropic'));
  console.log(chalk.dim('  compliance-check config set anthropicApiKey sk-ant-...'));
  console.log(chalk.dim('  compliance-check config set similarityThreshold 0.65\n'));
}

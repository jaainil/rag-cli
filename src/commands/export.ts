import chalk from 'chalk';
import fs from 'fs';
import { DatabaseManager } from '../db/sqlite';
import { ReportExporter } from '../core/exporter';

export function handleExport(options: { format?: string; output?: string }): void {
  const db = new DatabaseManager();
  const latestReport = db.getLatestScanReport();

  if (!latestReport) {
    console.log(chalk.red('\nNo scan report available to export.'));
    console.log(chalk.gray('Please run a scan first: ') + chalk.cyan('compliance-check scan <file.pdf>\n'));
    process.exit(1);
  }

  const format = (options.format || 'json').toLowerCase();
  if (!['json', 'csv', 'html'].includes(format)) {
    console.log(chalk.red(`Invalid export format: "${format}". Supported formats are: json, csv, html.`));
    process.exit(1);
  }

  try {
    const exportedPath = ReportExporter.exportReport(
      latestReport,
      format as 'json' | 'csv' | 'html',
      options.output
    );
    const size = fs.statSync(exportedPath).size;

    console.log(chalk.green.bold('\n✔ Report successfully exported!'));
    console.log(`  ${chalk.gray('Format:')}   ${chalk.cyan(format.toUpperCase())}`);
    console.log(`  ${chalk.gray('Target:')}   ${chalk.white.bold(exportedPath)}`);
    console.log(`  ${chalk.gray('Size:')}     ${chalk.yellow((size / 1024).toFixed(2))} KB`);
    console.log(`  ${chalk.gray('Flags:')}    ${chalk.magenta(latestReport.flagCount)} regulatory findings included\n`);
  } catch (err: any) {
    console.error(chalk.red(`Failed to export report: ${err.message}`));
    process.exit(1);
  }
}

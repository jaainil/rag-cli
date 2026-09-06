import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { PreShipmentAuditor } from '../core/preShipmentAuditor';
import { PreShipmentRenderer } from '../core/preShipmentRenderer';
import { PreShipmentExporter } from '../core/preShipmentExporter';
import { PreShipmentAuditReport } from '../types/preshipment';

export async function handlePreShipment(
  manifestPath: string,
  options: { export?: string; output?: string } = {}
): Promise<PreShipmentAuditReport> {
  const resolved = path.resolve(manifestPath);

  if (!fs.existsSync(resolved)) {
    console.error(chalk.red(`\nError: Pre-shipment manifest/dossier not found at: ${manifestPath}\n`));
    process.exit(1);
  }

  let dossier;
  try {
    dossier = PreShipmentAuditor.loadDossierFromFile(resolved);
  } catch (err: any) {
    console.error(chalk.red(`\nFailed to parse shipment dossier: ${err.message}\n`));
    process.exit(1);
  }

  const report = PreShipmentAuditor.auditDossier(dossier);

  // Render to terminal
  PreShipmentRenderer.renderTerminalReport(report);

  // Optional direct export if requested
  if (options.export) {
    const fmt = options.export.toLowerCase() as 'json' | 'csv' | 'html';
    const out = PreShipmentExporter.exportReport(report, fmt, options.output);
    console.log(chalk.green(`  ✔ Defense dossier exported to: ${chalk.bold(out)}\n`));
  }

  return report;
}

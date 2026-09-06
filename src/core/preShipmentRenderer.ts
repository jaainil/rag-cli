import chalk from 'chalk';
import boxen from 'boxen';
import { PreShipmentAuditReport, GateAuditResult, GateStatus } from '../types/preshipment';

export class PreShipmentRenderer {
  public static renderTerminalReport(report: PreShipmentAuditReport): void {
    const isCleared = report.overallDecision === 'CLEARED_FOR_EXPORT';
    const borderColor = isCleared ? 'green' : 'red';

    const header = [
      chalk.bold.white('U.S. PHARMA EXPORT — PRE-SHIPMENT MASTER REGULATORY AUDIT'),
      `${chalk.gray('Shipment ID:')} ${chalk.cyan.bold(report.shipmentId)}  |  ${chalk.gray('Product:')} ${chalk.white.bold(report.productName)}`,
      `${chalk.gray('Batch Number:')} ${chalk.yellow.bold(report.batchNumber)}  |  ${chalk.gray('Type:')} ${chalk.magenta(report.productType)}`,
      `${chalk.gray('Audited At:')} ${new Date(report.auditedAt).toUTCString()}`,
      `${chalk.gray('Total Checks:')} ${chalk.bold(report.totalChecks)}  (${chalk.green.bold(`${report.passCount} PASS`)}, ${chalk.red.bold(`${report.failCount} FAIL`)}, ${chalk.yellow.bold(`${report.warningCount} WARN`)})`,
    ].join('\n');

    console.log(
      boxen(header, {
        padding: { top: 0, bottom: 0, left: 2, right: 2 },
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderColor,
        borderStyle: 'round',
      })
    );

    // Decision Banner
    if (isCleared) {
      const clearedBox = [
        chalk.green.bold('✔ CLEARED FOR U.S. EXPORT — ALL 10 REGULATORY GATES SATISFIED'),
        chalk.white('This shipment has passed facility registration, product eligibility, drug listing,'),
        chalk.white('statutory approval pathway, cGMP, QA batch release, physical labeling, import alert,'),
        chalk.white('and customs entry documentation checks. Compliant and legally defensible for U.S. entry.'),
      ].join('\n');

      console.log(
        boxen(clearedBox, {
          padding: 1,
          borderColor: 'green',
          borderStyle: 'double',
          margin: { top: 0, bottom: 1, left: 0, right: 0 },
        })
      );
    } else {
      const stopBox = [
        chalk.bgRed.black.bold(' 🛑 FINAL GATE 10 DECISION: SHIPMENT MUST BE STOPPED — DO NOT SHIP '),
        '',
        chalk.red.bold('CRITICAL HARD STOP: The shipment violates one or more U.S. FDA statutory requirements.'),
        chalk.white('Offering this shipment for import in its current state risks immediate port detention,'),
        chalk.white('FDA Refusal of Admission (Sec. 801), US Customs seizure, or placement on FDA Import Alert.'),
        '',
        chalk.bold.yellow('Triggered Hard-Stop Violations:'),
        ...report.hardStopTriggers.map((t) => chalk.red(`  • 🛑 ${t}`)),
      ].join('\n');

      console.log(
        boxen(stopBox, {
          padding: 1,
          borderColor: 'red',
          borderStyle: 'double',
          margin: { top: 0, bottom: 1, left: 0, right: 0 },
        })
      );
    }

    // 10-Gate Summary Grid
    console.log(chalk.bold.white('10-GATE PRE-SHIPMENT AUDIT SUMMARY:'));
    console.log(chalk.gray('─'.repeat(74)));

    for (const gate of report.gates) {
      this.renderGateRow(gate);
    }

    console.log(chalk.gray('─'.repeat(74)));

    // Render detailed failures or warnings if present
    const problemGates = report.gates.filter((g) => g.status === 'FAIL' || g.checks.some((c) => c.status !== 'PASS'));

    if (problemGates.length > 0) {
      console.log(chalk.bold.underline('\nDETAILED GATE FINDINGS & FDA DEFICIENCIES:'));

      for (const gate of problemGates) {
        console.log(`\n${chalk.bold.cyan(`Gate ${gate.gateNumber}: ${gate.gateName}`)} [${this.formatStatus(gate.status)}]`);
        console.log(chalk.dim(`  Summary: ${gate.summary}`));

        for (const check of gate.checks) {
          if (check.status !== 'PASS') {
            const icon = check.status === 'FAIL' ? chalk.red('✖ [FAIL]') : chalk.yellow('⚠ [WARN]');
            console.log(`  ${icon} ${chalk.bold.white(check.label)}`);
            console.log(`     ${chalk.gray('Details:')} ${check.status === 'FAIL' ? chalk.redBright(check.details) : chalk.yellow(check.details)}`);
            if (check.cfrReference) {
              console.log(`     ${chalk.gray('CFR / Statute:')} ${chalk.magenta(check.cfrReference)}`);
            }
            if (check.fdaSystem) {
              console.log(`     ${chalk.gray('FDA Subsystem:')} ${chalk.cyan(check.fdaSystem)}`);
            }
          }
        }
      }
    }

    console.log(chalk.gray('\n' + '─'.repeat(74)));
    console.log(
      chalk.dim('Run ') +
        chalk.cyan(`compliance-check preshipment <file> --export html`) +
        chalk.dim(' to generate a U.S. Customs Defense Dossier.')
    );
    console.log(
      chalk.dim('Run ') +
        chalk.cyan(`compliance-check preshipment <file> --export json`) +
        chalk.dim(' to archive the audit release certificate.\n')
    );
  }

  private static renderGateRow(gate: GateAuditResult): void {
    const badge = this.formatBadge(gate.status);
    const gateNum = String(gate.gateNumber).padStart(2, ' ');
    const namePadded = gate.gateName.padEnd(52, ' ');
    console.log(`  Gate ${chalk.bold(gateNum)}: ${chalk.white(namePadded)} ${badge}`);
  }

  private static formatBadge(status: GateStatus): string {
    switch (status) {
      case 'PASS':
        return chalk.bgGreen.black.bold(' PASS ');
      case 'FAIL':
        return chalk.bgRed.black.bold(' FAIL ');
      case 'WARNING':
        return chalk.bgYellow.black.bold(' WARN ');
      case 'NOT_APPLICABLE':
        return chalk.bgGray.white(' N/A  ');
    }
  }

  private static formatStatus(status: GateStatus): string {
    switch (status) {
      case 'PASS':
        return chalk.green.bold('PASS');
      case 'FAIL':
        return chalk.red.bold('FAIL - HARD STOP');
      case 'WARNING':
        return chalk.yellow.bold('WARNING');
      case 'NOT_APPLICABLE':
        return chalk.gray('N/A');
    }
  }
}

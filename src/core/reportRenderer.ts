import chalk from 'chalk';
import boxen from 'boxen';
import { ScanReport, FlaggedIssue, RiskLevel } from '../types';

export class ReportRenderer {
  public static renderTerminalReport(report: ScanReport): void {
    const borderColor =
      report.highCount > 0 ? 'red' : report.mediumCount > 0 ? 'yellow' : 'green';

    const headerText = [
      chalk.bold.white('SOP Compliance Risk Audit Report'),
      `${chalk.gray('File:')} ${chalk.cyan(report.filename)}`,
      `${chalk.gray('Scanned:')} ${new Date(report.scannedAt).toUTCString()}`,
      `${chalk.gray('Sections scanned:')} ${chalk.bold(report.sectionCount)}   ${chalk.gray('Flags found:')} ${chalk.bold(report.flagCount)}`,
      `${chalk.gray('Risk Breakdown:')} ${chalk.red.bold(`${report.highCount} HIGH`)}  |  ${chalk.yellow.bold(`${report.mediumCount} MEDIUM`)}  |  ${chalk.blue.bold(`${report.lowCount} LOW`)}`,
    ].join('\n');

    console.log(
      boxen(headerText, {
        padding: { top: 0, bottom: 0, left: 2, right: 2 },
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderColor,
        borderStyle: 'round',
      })
    );

    if (report.flags.length === 0) {
      console.log(
        chalk.green.bold('  ✔ No cGMP regulatory vulnerabilities identified in this SOP.\n')
      );
      return;
    }

    for (const flag of report.flags) {
      this.renderFlagCard(flag);
    }

    console.log(chalk.gray('─'.repeat(70)));
    console.log(
      chalk.dim('Run ') +
        chalk.cyan(`compliance-check explain ${report.flags[0]?.sectionRef || '<section>'}`) +
        chalk.dim(' for full reasoning on a section.')
    );
    console.log(
      chalk.dim('Run ') +
        chalk.cyan('compliance-check export --format=json') +
        chalk.dim(' to save this report.\n')
    );
  }

  private static renderFlagCard(flag: FlaggedIssue): void {
    const badge = this.formatRiskBadge(flag.riskLevel);
    const confidenceColor =
      flag.confidence >= 80 ? chalk.green : flag.confidence >= 60 ? chalk.yellow : chalk.gray;

    console.log(
      `${badge} ${chalk.bold.white(`Section ${flag.sectionRef}`)} — ${chalk.white(flag.sectionTitle)}`
    );
    console.log(`  ${chalk.gray('Issue:')} ${chalk.bold(flag.issue)}`);
    if (flag.regulation) {
      console.log(`  ${chalk.gray('Regulation:')} ${chalk.magenta(flag.regulation)}`);
    }
    console.log(
      `  ${chalk.gray('Matched precedent:')} ${chalk.yellow(flag.matchedPrecedent.source)} (${chalk.dim(flag.matchedPrecedent.companyRedacted)})`
    );

    // Indented quote excerpt
    const excerptLines = flag.matchedPrecedent.excerpt.match(/.{1,70}(\s|$)/g) || [
      flag.matchedPrecedent.excerpt,
    ];
    console.log(chalk.dim('    "' + excerptLines[0]?.trim()));
    if (excerptLines[1]) {
      console.log(chalk.dim('     ' + excerptLines[1]?.trim() + '..."'));
    } else {
      console.log(chalk.dim('    "'));
    }

    console.log(`  ${chalk.gray('Confidence:')} ${confidenceColor.bold(`${flag.confidence}%`)}`);
    console.log('');
  }

  public static renderExplanation(flag: FlaggedIssue, sectionContent?: string): void {
    const badge = this.formatRiskBadge(flag.riskLevel);

    const header = [
      `${badge} ${chalk.bold.white(`Regulatory Deep Dive: Section ${flag.sectionRef}`)}`,
      `${chalk.gray('Title:')} ${chalk.cyan.bold(flag.sectionTitle)}`,
      `${chalk.gray('Statute:')} ${chalk.magenta.bold(flag.regulation)}`,
      `${chalk.gray('Auditor Confidence:')} ${chalk.green.bold(`${flag.confidence}%`)}`,
    ].join('\n');

    console.log(
      boxen(header, {
        padding: 1,
        borderColor: flag.riskLevel === 'HIGH' ? 'red' : flag.riskLevel === 'MEDIUM' ? 'yellow' : 'blue',
        borderStyle: 'double',
      })
    );

    console.log(chalk.bold.underline('1. PRIMARY COMPLIANCE DEFECT'));
    console.log(`   ${chalk.red.bold(flag.issue)}\n`);

    if (sectionContent) {
      console.log(chalk.bold.underline('2. AUDITED SOP CLAUSE'));
      console.log(chalk.italic.gray(`   "${sectionContent.trim()}"\n`));
    }

    console.log(chalk.bold.underline('3. REGULATORY RISK ANALYSIS'));
    const reasoningLines = flag.detailedReasoning.match(/.{1,78}(\s|$)/g) || [flag.detailedReasoning];
    reasoningLines.forEach((line) => console.log(`   ${chalk.white(line.trim())}`));
    console.log('');

    console.log(chalk.bold.underline('4. HISTORICAL FDA PRECEDENT MATCH'));
    console.log(`   ${chalk.yellow.bold(flag.matchedPrecedent.source)}`);
    console.log(`   ${chalk.dim(`Facility / Date: ${flag.matchedPrecedent.companyRedacted} (${flag.matchedPrecedent.dateIssued})`)}`);
    console.log(`   ${chalk.gray('FDA Observation Excerpt:')}`);
    const quoteLines = flag.matchedPrecedent.excerpt.match(/.{1,74}(\s|$)/g) || [flag.matchedPrecedent.excerpt];
    quoteLines.forEach((q) => console.log(`     ${chalk.dim.italic(`"${q.trim()}"`)}`));
    console.log('');

    console.log(chalk.bold.underline('5. REMEDIATION RECOMMENDATION (AUDIT-READY CLAUSE)'));
    const remBox = chalk.greenBright(flag.remediationRecommendation);
    console.log(
      boxen(remBox, {
        padding: 1,
        borderColor: 'green',
        borderStyle: 'round',
      })
    );
  }

  private static formatRiskBadge(level: RiskLevel): string {
    switch (level) {
      case 'HIGH':
        return chalk.bgRed.black.bold(' HIGH ') + '  ';
      case 'MEDIUM':
        return chalk.bgYellow.black.bold(' MEDIUM ') + '';
      case 'LOW':
        return chalk.bgBlue.black.bold(' LOW ') + '   ';
    }
  }
}

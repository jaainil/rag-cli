import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { PrecedentFlag, RiskLevel } from '../types';
import { DatabaseManager } from '../db/sqlite';

const BULK_ZIP_URL = 'https://download.open.fda.gov/drug/enforcement/drug-enforcement-0001-of-0001.json.zip';

interface OpenFDARecallRecord {
  recall_number: string;
  reason_for_recall?: string;
  status?: string;
  classification?: string; // "Class I", "Class II", "Class III"
  product_description?: string;
  product_quantity?: string;
  recalling_firm?: string;
  recall_initiation_date?: string; // "YYYYMMDD"
  report_date?: string;
  voluntary_mandated?: string;
  distribution_pattern?: string;
  code_info?: string;
}

export function classifyRecallCFR(reason: string, description: string): {
  category: string;
  cfr: string;
  keywords: string[];
  remediation: string;
} {
  const text = `${reason} ${description}`.toLowerCase();

  // 1. Sterility Assurance & Aseptic Processing (21 CFR 211.42)
  if (
    text.includes('steril') ||
    text.includes('aseptic') ||
    text.includes('endotoxin') ||
    text.includes('bioburden') ||
    text.includes('microbial')
  ) {
    return {
      category: 'Aseptic Controls & Environmental Monitoring',
      cfr: '21 CFR 211.42',
      keywords: ['sterility', 'aseptic', 'microbial', 'endotoxin', 'bioburden', 'contamination', 'recall'],
      remediation:
        'Verify Grade A critical zone environmental monitoring protocols, dynamic smoke studies, and media fill simulation frequencies per 21 CFR 211.42.',
    };
  }

  // 2. Equipment Cleaning Validation & Cross-Contamination (21 CFR 211.67)
  if (
    text.includes('cleaning') ||
    text.includes('cross-contaminat') ||
    text.includes('residue') ||
    text.includes('particulate') ||
    text.includes('foreign matter') ||
    text.includes('hold time')
  ) {
    return {
      category: 'Cleaning Validation',
      cfr: '21 CFR 211.67',
      keywords: ['cleaning', 'cross-contamination', 'particulate', 'hold time', 'residue', 'swab', 'recall'],
      remediation:
        'Establish validated maximum dirty hold times (DHT) and quantitative swab analytical limits (TOC/HPLC) between campaign changeovers per 21 CFR 211.67.',
    };
  }

  // 3. Out of Specification, Assay & Stability (21 CFR 211.166 / 211.192)
  if (
    text.includes('stability') ||
    text.includes('out-of-specification') ||
    text.includes('out of specification') ||
    text.includes('oos') ||
    text.includes('subpotent') ||
    text.includes('superpotent') ||
    text.includes('potency') ||
    text.includes('dissolution') ||
    text.includes('degradation') ||
    text.includes('impurity')
  ) {
    return {
      category: 'Stability Testing',
      cfr: '21 CFR 211.166',
      keywords: ['stability', 'oos', 'potency', 'dissolution', 'degradation', 'subpotent', 'recall'],
      remediation:
        'Enforce statistical out-of-trend (OOT) alert limits and formal Phase 1/Phase 2 laboratory investigation workflows prior to batch disposition per 21 CFR 211.166.',
    };
  }

  // 4. Packaging, Container Closure & Labeling (21 CFR 211.122 / 211.84)
  if (
    text.includes('labeling') ||
    text.includes('packaging') ||
    text.includes('container closure') ||
    text.includes('seal') ||
    text.includes('leak')
  ) {
    return {
      category: 'Component Testing & Supplier Qualification',
      cfr: '21 CFR 211.84',
      keywords: ['packaging', 'container closure', 'seal integrity', 'leak', 'labeling', 'recall'],
      remediation:
        'Validate container closure integrity testing (CCIT) and enforce automated vision inspection systems for packaging line clearance per 21 CFR 211.122.',
    };
  }

  // 5. General cGMP & Deviation Investigation (21 CFR 211.192)
  return {
    category: 'Deviation Handling & OOS',
    cfr: '21 CFR 211.192',
    keywords: ['cgmp', 'deviation', 'investigation', 'quality assurance', 'adulteration', 'recall'],
    remediation:
      'Ensure all manufacturing discrepancies undergo formal root-cause investigation within statutory 30-day timelines prior to commercial batch release per 21 CFR 211.192.',
  };
}

export async function downloadFile(url: string, destPath: string): Promise<void> {
  if (fs.existsSync(destPath)) {
    console.log(`Using cached download: ${destPath}`);
    return;
  }

  console.log(`Downloading openFDA bulk archive from:\n  ${url}`);
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Use curl with follow redirects
  execSync(`curl -sSL -o "${destPath}" "${url}"`, { stdio: 'inherit' });
  console.log(`Download complete: ${(fs.statSync(destPath).size / (1024 * 1024)).toFixed(2)} MB`);
}

export function parseRecallsFromZip(
  zipPath: string,
  options: { maxRecords?: number; filterCgmpOnly?: boolean } = {}
): PrecedentFlag[] {
  const targetDir = path.dirname(zipPath);
  const jsonName = 'drug-enforcement-0001-of-0001.json';
  const extractedJson = path.join(targetDir, jsonName);

  if (!fs.existsSync(extractedJson)) {
    console.log(`Extracting ${path.basename(zipPath)}...`);
    execSync(`unzip -q -o "${zipPath}" -d "${targetDir}"`);
  }

  console.log(`Reading openFDA JSON archive...`);
  const raw = fs.readFileSync(extractedJson, 'utf-8');
  const parsed = JSON.parse(raw);
  const rawRecords: OpenFDARecallRecord[] = parsed.results || [];
  console.log(`Total raw openFDA records in archive: ${rawRecords.length}`);

  const precedents: PrecedentFlag[] = [];
  const max = options.maxRecords || 5000;
  const filterCgmp = options.filterCgmpOnly !== false;

  for (const r of rawRecords) {
    if (!r.reason_for_recall || r.reason_for_recall.trim().length < 15) continue;

    const reason = r.reason_for_recall;
    const desc = r.product_description || '';
    const lower = `${reason} ${desc}`.toLowerCase();

    // Check if relevant to cGMP manufacturing / testing / storage
    if (filterCgmp) {
      const isCgmpRelevant =
        lower.includes('cgmp') ||
        lower.includes('good manufacturing') ||
        lower.includes('steril') ||
        lower.includes('clean') ||
        lower.includes('contaminat') ||
        lower.includes('particulate') ||
        lower.includes('stability') ||
        lower.includes('oos') ||
        lower.includes('potency') ||
        lower.includes('subpotent') ||
        lower.includes('superpotent') ||
        lower.includes('dissolution') ||
        lower.includes('hold time') ||
        lower.includes('seal') ||
        lower.includes('foreign') ||
        lower.includes('degradation');

      if (!isCgmpRelevant) continue;
    }

    const { category, cfr, keywords, remediation } = classifyRecallCFR(reason, desc);

    // Format date from YYYYMMDD to YYYY-MM-DD
    let dateIssued = '2020-01-01';
    if (r.recall_initiation_date && r.recall_initiation_date.length === 8) {
      const y = r.recall_initiation_date.slice(0, 4);
      const m = r.recall_initiation_date.slice(4, 6);
      const d = r.recall_initiation_date.slice(6, 8);
      dateIssued = `${y}-${m}-${d}`;
    }

    // Determine severity
    let severity: RiskLevel = 'MEDIUM';
    if (r.classification?.includes('Class I')) {
      severity = 'HIGH';
    } else if (r.classification?.includes('Class III')) {
      severity = 'LOW';
    }

    const id = `FDA-REC-${r.recall_number.replace(/[^a-zA-Z0-9]/g, '-')}`;

    precedents.push({
      id,
      source: `FDA Drug Recall (${r.recall_number}) — ${r.classification || 'Class II'}`,
      company_redacted: r.recalling_firm || 'Pharmaceutical Manufacturer (Redacted)',
      category,
      cfr_citation: cfr,
      severity,
      excerpt: `${reason.trim()} [Product: ${desc.trim().slice(0, 150)}]`,
      issue_summary: reason.length > 140 ? `${reason.slice(0, 137)}...` : reason,
      remediation_guidance: remediation,
      date_issued: dateIssued,
      feedback_score: 1.0,
      keywords,
    });

    if (precedents.length >= max) {
      break;
    }
  }

  console.log(`Successfully transformed ${precedents.length} cGMP FDA enforcement records.`);
  return precedents;
}

export async function runIngestion(options: {
  maxRecords?: number;
  outputJson?: string;
  seedDb?: boolean;
}): Promise<{ precedents: PrecedentFlag[]; outputPath: string }> {
  const dataDir = path.resolve(process.cwd(), 'data');
  const zipPath = path.join(dataDir, 'drug-enforcement.json.zip');
  const outputJsonPath = options.outputJson
    ? path.resolve(options.outputJson)
    : path.join(dataDir, 'openfda_recalls_18yr_cgmp.json');

  await downloadFile(BULK_ZIP_URL, zipPath);
  const precedents = parseRecallsFromZip(zipPath, { maxRecords: options.maxRecords || 2500 });

  fs.writeFileSync(outputJsonPath, JSON.stringify(precedents, null, 2), 'utf-8');
  console.log(`Exported clean JSON knowledge base: ${outputJsonPath} (${(fs.statSync(outputJsonPath).size / (1024 * 1024)).toFixed(2)} MB)`);

  if (options.seedDb) {
    console.log(`Ingesting into SQLite precedent database...`);
    const db = new DatabaseManager();
    db.insertPrecedents(precedents);
    console.log(`Database now contains ${db.getPrecedentCount()} indexed FDA records!`);
    db.close();
  }

  return { precedents, outputPath: outputJsonPath };
}

if (require.main === module) {
  const shouldSeed = process.argv.includes('--seed') || process.argv.includes('--sqlite');
  const countArg = process.argv.find((a) => a.startsWith('--limit='));
  const maxRecords = countArg ? parseInt(countArg.split('=')[1], 10) : 2500;

  runIngestion({ maxRecords, seedDb: shouldSeed }).catch((err) => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });
}

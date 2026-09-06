import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { PrecedentFlag, ScanReport, FlaggedIssue } from '../types';

export class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
    } else {
      const dataDir = path.join(os.homedir(), '.compliance-check');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.dbPath = path.join(dataDir, 'compliance_check.db');
    }

    const parentDir = path.dirname(this.dbPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS precedent_flags (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        company_redacted TEXT NOT NULL,
        category TEXT NOT NULL,
        cfr_citation TEXT NOT NULL,
        severity TEXT NOT NULL,
        excerpt TEXT NOT NULL,
        issue_summary TEXT NOT NULL,
        remediation_guidance TEXT NOT NULL,
        date_issued TEXT NOT NULL,
        feedback_score REAL DEFAULT 1.0,
        keywords_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_precedent_category ON precedent_flags(category);
      CREATE INDEX IF NOT EXISTS idx_precedent_cfr ON precedent_flags(cfr_citation);

      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        sop_filename TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        section_count INTEGER NOT NULL,
        flag_count INTEGER NOT NULL,
        high_count INTEGER NOT NULL,
        medium_count INTEGER NOT NULL,
        low_count INTEGER NOT NULL,
        raw_report_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scan_flags (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        section_ref TEXT NOT NULL,
        section_title TEXT NOT NULL,
        matched_precedent_id TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        issue_summary TEXT NOT NULL,
        explanation TEXT NOT NULL,
        remediation TEXT NOT NULL,
        review_status TEXT DEFAULT 'pending',
        reviewer_note TEXT,
        FOREIGN KEY (scan_id) REFERENCES scans(id),
        FOREIGN KEY (matched_precedent_id) REFERENCES precedent_flags(id)
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        flag_id TEXT NOT NULL,
        decision TEXT NOT NULL, -- 'accept' or 'reject'
        reviewer_note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  public getPrecedentCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM precedent_flags').get() as { count: number };
    return row?.count ?? 0;
  }

  public getAllPrecedents(): PrecedentFlag[] {
    const rows = this.db.prepare('SELECT * FROM precedent_flags').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      company_redacted: r.company_redacted,
      category: r.category,
      cfr_citation: r.cfr_citation,
      severity: r.severity,
      excerpt: r.excerpt,
      issue_summary: r.issue_summary,
      remediation_guidance: r.remediation_guidance,
      date_issued: r.date_issued,
      feedback_score: r.feedback_score,
      keywords: JSON.parse(r.keywords_json || '[]'),
    }));
  }

  public insertPrecedents(precedents: PrecedentFlag[]): void {
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO precedent_flags (
        id, source, company_redacted, category, cfr_citation,
        severity, excerpt, issue_summary, remediation_guidance,
        date_issued, feedback_score, keywords_json
      ) VALUES (
        @id, @source, @company_redacted, @category, @cfr_citation,
        @severity, @excerpt, @issue_summary, @remediation_guidance,
        @date_issued, @feedback_score, @keywords_json
      )
    `);

    const transaction = this.db.transaction((items: PrecedentFlag[]) => {
      for (const item of items) {
        insertStmt.run({
          ...item,
          keywords_json: JSON.stringify(item.keywords || []),
        });
      }
    });

    transaction(precedents);
  }

  public saveScanReport(report: ScanReport): void {
    const insertScan = this.db.prepare(`
      INSERT OR REPLACE INTO scans (
        id, sop_filename, file_hash, scanned_at,
        section_count, flag_count, high_count, medium_count, low_count,
        raw_report_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    const insertFlag = this.db.prepare(`
      INSERT OR REPLACE INTO scan_flags (
        id, scan_id, section_ref, section_title,
        matched_precedent_id, risk_level, confidence,
        issue_summary, explanation, remediation, review_status
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending'
      )
    `);

    const transaction = this.db.transaction(() => {
      insertScan.run(
        report.id,
        report.filename,
        report.fileHash,
        report.scannedAt,
        report.sectionCount,
        report.flagCount,
        report.highCount,
        report.mediumCount,
        report.lowCount,
        JSON.stringify(report)
      );

      for (const flag of report.flags) {
        insertFlag.run(
          flag.id,
          report.id,
          flag.sectionRef,
          flag.sectionTitle,
          flag.matchedPrecedent.id,
          flag.riskLevel,
          flag.confidence,
          flag.issue,
          flag.detailedReasoning,
          flag.remediationRecommendation
        );
      }
    });

    transaction();
  }

  public getLatestScanReport(): ScanReport | null {
    const row = this.db.prepare('SELECT raw_report_json FROM scans ORDER BY scanned_at DESC LIMIT 1').get() as { raw_report_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.raw_report_json) as ScanReport;
    } catch {
      return null;
    }
  }

  public getScanHistory(filename?: string): any[] {
    if (filename) {
      return this.db.prepare('SELECT id, sop_filename, scanned_at, section_count, flag_count, high_count, medium_count, low_count FROM scans WHERE sop_filename LIKE ? ORDER BY scanned_at DESC').all(`%${filename}%`);
    }
    return this.db.prepare('SELECT id, sop_filename, scanned_at, section_count, flag_count, high_count, medium_count, low_count FROM scans ORDER BY scanned_at DESC').all();
  }

  public logReview(flagId: string, decision: 'accept' | 'reject', note?: string): void {
    const reviewId = `REV-${Date.now()}`;
    const insertReview = this.db.prepare('INSERT INTO reviews (id, flag_id, decision, reviewer_note, created_at) VALUES (?, ?, ?, ?, ?)');
    const updateFlag = this.db.prepare('UPDATE scan_flags SET review_status = ?, reviewer_note = ? WHERE id = ? OR section_ref = ?');
    
    // Also adjust precedent feedback score
    const flagRow = this.db.prepare('SELECT matched_precedent_id FROM scan_flags WHERE id = ? OR section_ref = ? LIMIT 1').get(flagId, flagId) as { matched_precedent_id: string } | undefined;

    const transaction = this.db.transaction(() => {
      insertReview.run(reviewId, flagId, decision, note || '', new Date().toISOString());
      updateFlag.run(decision === 'accept' ? 'accepted' : 'rejected', note || '', flagId, flagId);

      if (flagRow?.matched_precedent_id) {
        const delta = decision === 'accept' ? 0.15 : -0.25;
        this.db.prepare('UPDATE precedent_flags SET feedback_score = MAX(0.2, MIN(2.0, feedback_score + ?)) WHERE id = ?').run(delta, flagRow.matched_precedent_id);
      }
    });

    transaction();
  }

  public close(): void {
    this.db.close();
  }
}

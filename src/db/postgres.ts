import { Pool, PoolClient } from 'pg';
import { PrecedentFlag, ScanReport, FlaggedIssue, RiskLevel } from '../types';

export class PostgresManager {
  private pool: Pool;
  private connectionString: string;
  private isInitialized: boolean = false;

  constructor(customUrl?: string) {
    this.connectionString =
      customUrl ||
      process.env.DATABASE_URL ||
      'postgres://postgres:AjP0tiYJUoV7bnQKep0o55lrUbsEU9fpsb0D2HnrLavZ8wRtg6RzfCqglgpuc19a@82.180.144.20:3060/postgres';

    this.pool = new Pool({
      connectionString: this.connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  public getConnectionString(): string {
    return this.connectionString.replace(/:[^:@]+@/, ':****@'); // mask password
  }

  public async initSchema(): Promise<void> {
    if (this.isInitialized) return;
    const client = await this.pool.connect();

    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

      await client.query(`
        CREATE TABLE IF NOT EXISTS precedent_flags (
          id VARCHAR(120) PRIMARY KEY,
          source TEXT NOT NULL,
          company_redacted TEXT NOT NULL,
          category VARCHAR(100) NOT NULL,
          cfr_citation VARCHAR(100) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          excerpt TEXT NOT NULL,
          issue_summary TEXT NOT NULL,
          remediation_guidance TEXT NOT NULL,
          date_issued DATE NOT NULL,
          feedback_score REAL DEFAULT 1.0,
          keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
          embedding vector(128)
        );

        CREATE INDEX IF NOT EXISTS idx_pg_precedent_category ON precedent_flags(category);
        CREATE INDEX IF NOT EXISTS idx_pg_precedent_cfr ON precedent_flags(cfr_citation);
        CREATE INDEX IF NOT EXISTS idx_pg_precedent_date ON precedent_flags(date_issued);

        CREATE TABLE IF NOT EXISTS scans (
          id VARCHAR(100) PRIMARY KEY,
          sop_filename TEXT NOT NULL,
          file_hash VARCHAR(64) NOT NULL,
          scanned_at TIMESTAMPTZ NOT NULL,
          section_count INT NOT NULL,
          flag_count INT NOT NULL,
          high_count INT NOT NULL,
          medium_count INT NOT NULL,
          low_count INT NOT NULL,
          raw_report_json JSONB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scan_flags (
          id VARCHAR(100) PRIMARY KEY,
          scan_id VARCHAR(100) REFERENCES scans(id) ON DELETE CASCADE,
          section_ref VARCHAR(50) NOT NULL,
          section_title TEXT NOT NULL,
          matched_precedent_id VARCHAR(120) REFERENCES precedent_flags(id),
          risk_level VARCHAR(20) NOT NULL,
          confidence INT NOT NULL,
          issue_summary TEXT NOT NULL,
          explanation TEXT NOT NULL,
          remediation TEXT NOT NULL,
          review_status VARCHAR(20) DEFAULT 'pending',
          reviewer_note TEXT
        );

        CREATE TABLE IF NOT EXISTS reviews (
          id VARCHAR(100) PRIMARY KEY,
          flag_id VARCHAR(100) NOT NULL,
          decision VARCHAR(20) NOT NULL,
          reviewer_note TEXT,
          created_at TIMESTAMPTZ NOT NULL
        );
      `);

      // Try creating HNSW index if it doesn't exist
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_precedents_hnsw
          ON precedent_flags USING hnsw (embedding vector_cosine_ops);
        `);
      } catch {
        // Fallback or ignore if table has too few rows initially
      }

      this.isInitialized = true;
    } finally {
      client.release();
    }
  }

  public async getPrecedentCount(): Promise<number> {
    await this.initSchema();
    const res = await this.pool.query('SELECT COUNT(*) as count FROM precedent_flags');
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  public async insertPrecedents(
    precedents: PrecedentFlag[],
    vectorGenerator?: (text: string) => number[]
  ): Promise<void> {
    await this.initSchema();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const insertText = `
        INSERT INTO precedent_flags (
          id, source, company_redacted, category, cfr_citation,
          severity, excerpt, issue_summary, remediation_guidance,
          date_issued, feedback_score, keywords, embedding
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::vector
        )
        ON CONFLICT (id) DO UPDATE SET
          source = EXCLUDED.source,
          excerpt = EXCLUDED.excerpt,
          issue_summary = EXCLUDED.issue_summary,
          remediation_guidance = EXCLUDED.remediation_guidance,
          embedding = EXCLUDED.embedding;
      `;

      for (const p of precedents) {
        let vecStr: string | null = null;
        if (p.embedding && p.embedding.length === 128) {
          vecStr = `[${p.embedding.join(',')}]`;
        } else if (vectorGenerator) {
          const textToEmbed = `${p.category} ${p.cfr_citation} ${p.issue_summary} ${p.excerpt} ${(p.keywords || []).join(' ')}`;
          const vec = vectorGenerator(textToEmbed);
          vecStr = `[${vec.join(',')}]`;
        }

        await client.query(insertText, [
          p.id,
          p.source,
          p.company_redacted,
          p.category,
          p.cfr_citation,
          p.severity,
          p.excerpt,
          p.issue_summary,
          p.remediation_guidance,
          p.date_issued,
          p.feedback_score || 1.0,
          JSON.stringify(p.keywords || []),
          vecStr,
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Native pgvector Cosine Search in PostgreSQL 18.
   */
  public async vectorSearch(
    queryVector: number[],
    limit: number = 5
  ): Promise<(PrecedentFlag & { cosineSimilarity: number })[]> {
    await this.initSchema();
    const vecStr = `[${queryVector.join(',')}]`;

    const query = `
      SELECT 
        id, source, company_redacted, category, cfr_citation, severity, excerpt, 
        issue_summary, remediation_guidance, to_char(date_issued, 'YYYY-MM-DD') as date_issued,
        feedback_score, keywords,
        1 - (embedding <=> $1::vector) AS cosine_similarity
      FROM precedent_flags
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2;
    `;

    const res = await this.pool.query(query, [vecStr, limit]);

    return res.rows.map((r) => ({
      id: r.id,
      source: r.source,
      company_redacted: r.company_redacted,
      category: r.category,
      cfr_citation: r.cfr_citation,
      severity: r.severity as RiskLevel,
      excerpt: r.excerpt,
      issue_summary: r.issue_summary,
      remediation_guidance: r.remediation_guidance,
      date_issued: r.date_issued,
      feedback_score: parseFloat(r.feedback_score || '1.0'),
      keywords: typeof r.keywords === 'string' ? JSON.parse(r.keywords) : r.keywords,
      cosineSimilarity: parseFloat(r.cosine_similarity || '0'),
    }));
  }

  public async getAllPrecedents(): Promise<PrecedentFlag[]> {
    await this.initSchema();
    const res = await this.pool.query(`
      SELECT 
        id, source, company_redacted, category, cfr_citation, severity, excerpt, 
        issue_summary, remediation_guidance, to_char(date_issued, 'YYYY-MM-DD') as date_issued,
        feedback_score, keywords
      FROM precedent_flags
      ORDER BY date_issued DESC;
    `);

    return res.rows.map((r) => ({
      id: r.id,
      source: r.source,
      company_redacted: r.company_redacted,
      category: r.category,
      cfr_citation: r.cfr_citation,
      severity: r.severity as RiskLevel,
      excerpt: r.excerpt,
      issue_summary: r.issue_summary,
      remediation_guidance: r.remediation_guidance,
      date_issued: r.date_issued,
      feedback_score: parseFloat(r.feedback_score || '1.0'),
      keywords: typeof r.keywords === 'string' ? JSON.parse(r.keywords) : r.keywords,
    }));
  }

  public async saveScanReport(report: ScanReport): Promise<void> {
    await this.initSchema();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const insertScan = `
        INSERT INTO scans (
          id, sop_filename, file_hash, scanned_at,
          section_count, flag_count, high_count, medium_count, low_count,
          raw_report_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          raw_report_json = EXCLUDED.raw_report_json;
      `;

      await client.query(insertScan, [
        report.id,
        report.filename,
        report.fileHash,
        report.scannedAt,
        report.sectionCount,
        report.flagCount,
        report.highCount,
        report.mediumCount,
        report.lowCount,
        JSON.stringify(report),
      ]);

      const insertFlag = `
        INSERT INTO scan_flags (
          id, scan_id, section_ref, section_title,
          matched_precedent_id, risk_level, confidence,
          issue_summary, explanation, remediation, review_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
        ON CONFLICT (id) DO NOTHING;
      `;

      for (const flag of report.flags) {
        await client.query(insertFlag, [
          flag.id,
          report.id,
          flag.sectionRef,
          flag.sectionTitle,
          flag.matchedPrecedent.id,
          flag.riskLevel,
          flag.confidence,
          flag.issue,
          flag.detailedReasoning,
          flag.remediationRecommendation,
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getLatestScanReport(): Promise<ScanReport | null> {
    await this.initSchema();
    const res = await this.pool.query('SELECT raw_report_json FROM scans ORDER BY scanned_at DESC LIMIT 1');
    if (res.rows.length === 0) return null;
    return res.rows[0].raw_report_json as ScanReport;
  }

  public async getScanHistory(filename?: string): Promise<any[]> {
    await this.initSchema();
    if (filename) {
      const res = await this.pool.query(
        'SELECT id, sop_filename, scanned_at, section_count, flag_count, high_count, medium_count, low_count FROM scans WHERE sop_filename ILIKE $1 ORDER BY scanned_at DESC',
        [`%${filename}%`]
      );
      return res.rows;
    }

    const res = await this.pool.query(
      'SELECT id, sop_filename, scanned_at, section_count, flag_count, high_count, medium_count, low_count FROM scans ORDER BY scanned_at DESC'
    );
    return res.rows;
  }

  public async logReview(flagId: string, decision: 'accept' | 'reject', note?: string): Promise<void> {
    await this.initSchema();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const reviewId = `REV-${Date.now()}`;

      await client.query(
        'INSERT INTO reviews (id, flag_id, decision, reviewer_note, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [reviewId, flagId, decision, note || '']
      );

      await client.query(
        'UPDATE scan_flags SET review_status = $1, reviewer_note = $2 WHERE id = $3 OR section_ref = $4',
        [decision === 'accept' ? 'accepted' : 'rejected', note || '', flagId, flagId]
      );

      const flagRow = await client.query(
        'SELECT matched_precedent_id FROM scan_flags WHERE id = $1 OR section_ref = $2 LIMIT 1',
        [flagId, flagId]
      );

      if (flagRow.rows[0]?.matched_precedent_id) {
        const delta = decision === 'accept' ? 0.15 : -0.25;
        await client.query(
          'UPDATE precedent_flags SET feedback_score = GREATEST(0.2, LEAST(2.0, feedback_score + $1)) WHERE id = $2',
          [delta, flagRow.rows[0].matched_precedent_id]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SOPSection {
  sectionNumber: string;
  title: string;
  content: string;
  startLine: number;
  wordCount: number;
  keyEntities: string[];
}

export interface PrecedentFlag {
  id: string;
  source: string;
  company_redacted: string;
  category: string;
  cfr_citation: string;
  severity: RiskLevel;
  excerpt: string;
  issue_summary: string;
  remediation_guidance: string;
  date_issued: string;
  feedback_score: number;
  keywords: string[];
  embedding?: number[];
}

export interface MatchedPrecedentRef {
  id: string;
  source: string;
  companyRedacted: string;
  dateIssued: string;
  excerpt: string;
  cfrCitation: string;
  remediationGuidance?: string;
  similarityScore?: number;
}

export interface FlaggedIssue {
  id: string;
  sectionRef: string;
  sectionTitle: string;
  riskLevel: RiskLevel;
  confidence: number; // 0 - 100
  issue: string;
  regulation: string;
  matchedPrecedent: MatchedPrecedentRef;
  detailedReasoning: string;
  remediationRecommendation: string;
  reviewStatus?: 'pending' | 'accepted' | 'rejected';
  reviewerNote?: string;
}

export interface ScanReport {
  id: string;
  filename: string;
  fileHash: string;
  scannedAt: string;
  sectionCount: number;
  flagCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  sections: SOPSection[];
  flags: FlaggedIssue[];
  executionTimeMs: number;
}

export interface AppConfig {
  llmProvider: 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'offline';
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  modelName?: string;
  similarityThreshold: number;
  vectorEngine: 'pgvector' | 'sqlite-local' | 'qdrant';
  qdrantUrl?: string;
}

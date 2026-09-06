# Compliance CLI — Pharma SOP & U.S. Export Master Auditor (`compliance-check`)

> **Enterprise terminal-native regulatory risk analysis for pharmaceutical SOPs and U.S. export shipments.**  
> Evaluates procedures and pre-shipment dossiers against **14,645+ real historical FDA enforcement actions** spanning 2006–2026 (openFDA cGMP Recalls, Warning Letters, Form 483 Observations) and statutory requirements (21 CFR Parts 210/211/11, FD&C Act, ICH Q7, EU GMP Annex 11/15).

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-v20+-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-12%20passing-brightgreen.svg)](test/)
[![AI-Engine](https://img.shields.io/badge/OpenRouter-meta%2Fmuse--spark--1.3--contributor-magenta.svg)](#)
[![Dataset](https://img.shields.io/badge/FDA%20Knowledge%20Base-14%2C645%20Citations-orange.svg)](#)

---

## 1. Overview & Architecture

Designed specifically for regulatory compliance directors, QA batch release managers, and import/export operations teams. `compliance-check` evaluates pharmaceutical SOPs, flags ambiguous clauses with exact line numbers and verbatim quotes, grounds every finding in historical FDA precedents, and audits Indian-pharma-to-U.S. shipments across **10 statutory regulatory gates** before cargo departs.

```
CLI (Node.js / TypeScript / Commander.js)
   │
   ├── Document Parser & Chunker → extracts sections from PDF / DOCX / Markdown / Text (SHA-256)
   │
   ├── Cache Layer (Dragonfly Redis) → sub-millisecond embedding & rerank caching
   │
   ├── OpenRouter Cloud AI Engine:
   │    ├── Embeddings: openai/text-embedding-3-small (1536-dim dense vectors)
   │    ├── Re-Ranking: voyageai/rerank-2.5 (cross-encoder semantic relevance)
   │    └── Audit & Reasoning: meta/muse-spark-1.3-contributor (deep thinking CoT)
   │
   ├── Dual-Tier Knowledge Base (14,645 Real FDA Precedents 2006–2026):
   │    ├── Primary: PostgreSQL 18 + pgvector (HNSW cosine similarity)
   │    └── Redundant Local: SQLite with BM25 hybrid ranking
   │
   ├── Pre-Shipment 10-Gate Auditor → Facility, Product, Drug Listing, Pathway, cGMP,
   │                                  QA Release, Labeling, Import Alert, Customs, Hard Stop
   │
   └── Presentation Layer → OpenCode-Style Interactive Chatbot + JSON / CSV / HTML Dossiers
```

---

## 2. Key Capabilities

1. **14,645+ Real FDA Enforcement Precedents (Past 18+ Years):**
   - Grounded in official openFDA enforcement actions and warning letters from 2006 to 2026.
   - Categorized into: Aseptic Controls & Environmental Monitoring (7,719), Deviation Handling & OOS (3,359), Stability Testing (2,791), Cleaning Validation (469), Component & Supplier Testing (218), Data Integrity (41), Change Control (24), and Quality Unit Oversight (24).

2. **Pinpointing Current SOP Flaws with Exact Line Numbers:**
   - Highlights the exact sentence or phrase in your SOP that creates regulatory vulnerability.
   - Maps line numbers directly back to source documents.
   - Cites verbatim historical FDA observations with facility names, dates, and remediation clauses.

3. **U.S. Pharma Export 10-Gate Master Pre-Shipment Audit:**
   - End-to-end statutory check before pharmaceutical cargo leaves India for the U.S.
   - Evaluates: FDA Facility Registration (DECRS), Product Legality, Drug Listing (eList/SPL), Regulatory Approval Pathway (NDA/ANDA/BLA/DMF), cGMP/BMR Discrepancies, Independent QA Batch Release (Hard Stop), Physical Labeling (21 CFR 201), Import Alerts (DWPE 66-40/99-32), Customs Entry (ACE Affirmations of Compliance), and Final "DO NOT SHIP" Hard Stop Gate.

4. **Powered by OpenRouter Cloud AI:**
   - **Audit & Reasoning:** `meta/muse-spark-1.3-contributor` with native chain-of-thought extraction.
   - **Embeddings:** `openai/text-embedding-3-small` (1536-dimensional embeddings).
   - **Re-ranking:** `voyageai/rerank-2.5` cross-encoder for high-precision citation reranking.

5. **Security & Zero Key Leakage:**
   - API keys are strictly read from the gitignored `.env` file via `process.env.OPENROUTER_API_KEY`.
   - Never hardcoded in source code or compiled output.

---

## 3. Quickstart & Installation

```bash
# Clone repository
git clone <repo-url>
cd rag-cli

# Install dependencies and build
npm install
npm run build

# Run full test suite (12 automated unit & integration tests)
npm test

# Configure your OpenRouter API Key in .env
echo "OPENROUTER_API_KEY=your_api_key_here" >> .env
echo "LLM_PROVIDER=openrouter" >> .env

# Start interactive chatbot session (Default)
./bin/compliance-check.js
# or: npm start
```

---

## 4. Command Reference

### 4.1 Scan SOP File or Batch Directory
```bash
# Scan a single SOP file (.md, .txt, .pdf, .docx)
compliance-check scan sample_sops/sop_deviation_handling.md

# Scan with deep reasoning mode
compliance-check scan sample_sops/sop_deviation_handling.md --deep

# Scan an entire directory of SOPs (Batch Scan)
compliance-check scan sample_sops/

# Scan and immediately export to HTML or CSV
compliance-check scan sample_sops/sop_deviation_handling.md --export html --output audit_report.html
```

### 4.2 U.S. Pharma Export — Pre-Shipment 10-Gate Master Audit (`preshipment`)
```bash
# Run 10-gate audit on pre-shipment export dossier (Finished Drug - Cleared)
compliance-check preshipment sample_shipments/atorvastatin_tablets_export_pass.json

# Audit high-risk failing shipment (Triggers hard-stop violations)
compliance-check preshipment sample_shipments/amoxicillin_capsules_export_fail.json

# Export official U.S. Customs Regulatory Defense Dossier (HTML, CSV, JSON)
compliance-check preshipment sample_shipments/atorvastatin_tablets_export_pass.json --export html
```

#### The 10 Gates Evaluated:
| Gate | Focus Area | Critical Statutory Checks |
| :--- | :--- | :--- |
| **Gate 1** | **Manufacturer / Facility** | FDA registration active, renewed annually, listed in DECRS, valid U.S. Agent |
| **Gate 2** | **Product Legal Importability** | Valid active ingredients, dosage form, strength, and intended use |
| **Gate 3** | **FDA Drug Listing & NDC** | Listed in FDA eList / SPL, NDC directory verified, matches foreign site |
| **Gate 4** | **Approval Pathway (HARD STOP)** | Verified NDA, ANDA, BLA, OTC Monograph, or API Type II DMF |
| **Gate 5** | **cGMP Compliance & BMR** | 21 CFR 210/211 controls, completed BMR/BPR, 0 open critical deviations, 0 open OOS |
| **Gate 6** | **Batch Release (QA SIGN-OFF)** | Signed Certificate of Analysis (COA), all specs passed, independent QA Unit release sign-off |
| **Gate 7** | **Physical Labeling** | 21 CFR 201 compliance, Rx Only symbol, lot/expiry, tamper evidence, 0 unapproved claims |
| **Gate 8** | **Import Alert & Debarment** | Checked against DWPE Import Alerts (e.g. 66-40, 99-32) and FDA Debarment list |
| **Gate 9** | **Customs & Shipping Entry** | Commercial invoice, packing list, airway bill, HTS code, FDA Product Code, Affirmations of Compliance (REG, DLS, AND/NDA) |
| **Gate 10** | **Final "DO NOT SHIP" Hard Stop** | Automated hard-stop matrix; halts dispatch if any critical failure is detected |

### 4.3 Interactive REPL Chatbot Commands
Launch with `compliance-check` (or `compliance-check chat`):
- `/scan <file> [--deep]` — Run compliance scan on an SOP file.
- `/preshipment <file>` — Audit U.S. export shipment across 10 gates.
- `/deep [question]` — Toggle or run deep reasoning via `meta/muse-spark-1.3-contributor`.
- `/explain <section>` — Deep-dive into a specific flagged section (e.g. `/explain 4.2`).
- `/review <flag> [--accept|--reject]` — Continuous learning feedback on flags.
- `/export [format]` — Export the active report as `json`, `csv`, or `html`.
- `/stats` — View FDA precedent database metrics.
- `/history` — View audit history log.

### 4.4 Inspect Knowledge Base Statistics
```bash
compliance-check dataset stats
```
Output:
```text
Total Precedents:    14,645 citations indexed
Date Range:          2006 – 2026
Severity:            14,544 High  |  101 Medium  |  0 Low

Category / cGMP Focus Area                  Records
────────────────────────────────────────────────────
Aseptic Controls & Environmental Monitoring 7,719
Deviation Handling & OOS                    3,359
Stability Testing                           2,791
Cleaning Validation                         469
Component Testing & Supplier Qualification  218
Data Integrity & Audit Trails               41
Change Control & Qualification              24
Quality Unit Oversight                      24
```

### 4.5 Configuration Management
```bash
# View enterprise configuration status
compliance-check config

# Update configuration keys
compliance-check config set llmProvider openrouter
compliance-check config set similarityThreshold 0.65
```

---

## 5. Sample Terminal Output

```text
$ compliance-check scan sample_sops/sop_deviation_handling.md

✔ Loading SOP...                     done (3.8 KB)
✔ Parsing sections...                10 sections found
✔ Embedding + retrieving matches...  done (14645 FDA precedents via SQLite Local + Dragonfly cache)
✔ Running risk analysis (meta/muse-spark-1.3-contributor [OpenRouter AI])... done

╭─────────────────────────────────────────────────╮
│  SOP Compliance Risk Audit Report               │
│  File: sop_deviation_handling.md                │
│  Scanned: Sun, 06 Sep 2026 11:15:00 GMT         │
│  Sections scanned: 10   Flags found: 4          │
│  Risk Breakdown: 2 HIGH  |  1 MEDIUM  |  1 LOW  │
╰─────────────────────────────────────────────────╯

 HIGH    Section 4.2 — Deviation Handling & Investigation Timeframes [Line 29]
  ▶ Current SOP Flawed Text:
    "Investigations shall proceed expeditiously and be completed as soon as
     feasible depending on operational constraints. In complex multi-departmental
     investigations, target dates may be extended upon verbal concurrence..."
  Compliance Defect: No defined timeline for deviation escalation
  Statutory Regulation: 21 CFR 211.192 (Unexplained discrepancies and failure investigations)
  ▶ Cited Historical FDA Precedent (Past Enforcement Data):
    Citation: FDA Warning Letter WL-320-24-72
    Target Facility: Topical and Transdermal Manufacturing Site (Redacted) | Issued: 2024-03-15
    Past Historical Enforcement Excerpt:
      "Investigations into assay failures and batch yield discrepancies
       repeatedly concluded 'operator error' without conducting thorough
       equipment calibration checks or extending timelines under QA supervision..."
    Precedent Remediation Standard: Mandate explicit 30-day investigation completion with QA risk assessment.
  Auditor Confidence: 94%

──────────────────────────────────────────────────────────────────────
Run compliance-check explain 4.2 for full reasoning on a section.
Run compliance-check export --format=html to save this report.
```

---

## 6. Environment Variables

Configure these in your `.env` file:

```ini
# OpenRouter Cloud AI Engine
OPENROUTER_API_KEY=your_openrouter_key
LLM_PROVIDER=openrouter
OPENROUTER_MODEL=meta/muse-spark-1.3-contributor
OPENROUTER_EMBED_MODEL=openai/text-embedding-3-small
OPENROUTER_RERANK_MODEL=voyageai/rerank-2.5

# Primary Vector Database (Optional - falls back to embedded SQLite)
DATABASE_URL=postgresql://postgres:postgres@localhost:3060/compliance_rag

# Dragonfly High-Performance Redis Cache (Optional - falls back to in-memory)
DRAGONFLY_URL=redis://localhost:3006
```

---

## 7. License

Proprietary — Developed by Jainil (Aexaware Infotech) for client evaluation and pharma regulatory compliance.

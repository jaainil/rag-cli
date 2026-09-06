import { SOPSection } from '../types';

// Regex patterns to capture common Pharma SOP section numbering schemes:
// e.g. "1.0 Purpose", "4.2 Deviation Handling", "Section 6.1 - Cleaning Validation", "## 3.0 Responsibilities"
// Must be a heading: typically shorter than 90 characters, or starts with markdown '#', or doesn't end with sentence period.
const EXPLICIT_HEADER_REGEX = /^(?:#+\s*)+(?:Section\s+)?([0-9]+(?:\.[0-9]+)*|[A-Z]\.[0-9]+|[IVXLCDM]+\.[0-9]*)\s*[:.\-—]?\s*(.+)$/i;
const NUMBERED_TITLE_REGEX = /^(?:Section\s+)?([0-9]+(?:\.[0-9]+)*|[A-Z]\.[0-9]+|[IVXLCDM]+\.[0-9]*)\s*[:.\-—]\s*([A-Z][A-Za-z0-9\s,&/()'\-—]+)$/;

// General fallback for lines like "4.2 Deviation Handling & Investigation Timeframes" without punctuation
const SHORT_HEADING_REGEX = /^(?:Section\s+)?([0-9]+(?:\.[0-9]+)*)\s+([A-Z][A-Za-z0-9\s,&/()'\-—]{2,60})$/;

const PHARMA_ENTITIES = [
  'deviation', 'oos', 'out-of-specification', 'investigation', 'root cause',
  'timeline', 'calendar days', 'business days', 'as soon as feasible', 'timely',
  'cleaning', 'validation', 'hold time', 'dirty hold time', 'clean hold time',
  'swab', 'rinse', 'periodic', 'periodically', 'visually clean', 'residue',
  'audit trail', 'part 11', 'electronic signature', 'shared account', 'admin',
  'backup', 'raw data', 'environmental monitoring', 'iso 5', 'grade a',
  'particle counter', 'differential pressure', 'smoke study', 'sterility',
  'quality assurance', 'quality unit', 'sign-off', 'release', 'quarantine',
  'change control', 're-qualification', 'supplier qualification', 'coa'
];

function isHeadingLine(line: string): { isHeading: boolean; sectionNumber: string; title: string } {
  const trimmed = line.trim();
  if (!trimmed) return { isHeading: false, sectionNumber: '', title: '' };

  // Explicit markdown heading: e.g. "### 3.0 Responsibilities" or "# 4.2 Deviation Handling"
  const mdMatch = trimmed.match(EXPLICIT_HEADER_REGEX);
  if (mdMatch && mdMatch[1] && mdMatch[2]) {
    const title = mdMatch[2].replace(/[*_#]/g, '').trim();
    return { isHeading: true, sectionNumber: mdMatch[1].trim(), title };
  }

  // Numbered title with separator: e.g. "1.0: Purpose" or "Section 6.1 - Cleaning Validation"
  const sepMatch = trimmed.match(NUMBERED_TITLE_REGEX);
  if (sepMatch && sepMatch[1] && sepMatch[2]) {
    const title = sepMatch[2].trim();
    // Ignore if it's a long sentence ending with period
    if (!title.endsWith('.') || title.length <= 40) {
      return { isHeading: true, sectionNumber: sepMatch[1].trim(), title };
    }
  }

  // Short heading without separator: e.g. "4.2 Deviation Handling"
  const shortMatch = trimmed.match(SHORT_HEADING_REGEX);
  if (shortMatch && shortMatch[1] && shortMatch[2]) {
    const title = shortMatch[2].trim();
    if (!title.endsWith('.') && title.length < 65) {
      return { isHeading: true, sectionNumber: shortMatch[1].trim(), title };
    }
  }

  // Markdown top headers without numbers: e.g. "## Responsibilities"
  if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
    const raw = trimmed.replace(/^#+\s*/, '').trim();
    if (raw.length < 70 && !raw.toLowerCase().includes('standard operating procedure:')) {
      return { isHeading: true, sectionNumber: '', title: raw };
    }
  }

  return { isHeading: false, sectionNumber: '', title: '' };
}

export function extractSections(rawText: string): SOPSection[] {
  const lines = rawText.split(/\r?\n/);
  const sections: SOPSection[] = [];

  let currentSectionNumber = '';
  let currentSectionTitle = '';
  let currentContentLines: string[] = [];
  let currentStartLine = 1;

  function commitCurrentSection() {
    const content = currentContentLines.join('\n').trim();
    if (content.length > 0 && currentSectionTitle) {
      const lowerContent = content.toLowerCase();
      const detectedEntities = PHARMA_ENTITIES.filter((entity) =>
        lowerContent.includes(entity)
      );

      sections.push({
        sectionNumber: currentSectionNumber || `${sections.length + 1}.0`,
        title: currentSectionTitle,
        content,
        startLine: currentStartLine,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        keyEntities: detectedEntities,
      });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { isHeading, sectionNumber, title } = isHeadingLine(line);

    if (isHeading) {
      commitCurrentSection();

      currentSectionNumber = sectionNumber || `${sections.length + 1}.0`;
      currentSectionTitle = title;
      currentContentLines = [];
      currentStartLine = i + 1;
    } else {
      currentContentLines.push(line);
    }
  }

  commitCurrentSection();

  // If no sections were identified, fallback to multi-paragraph blocks
  if (sections.length === 0) {
    const paragraphs = rawText.split(/\n\s*\n/).filter((p) => p.trim().length > 30);
    paragraphs.forEach((p, idx) => {
      const pLines = p.trim().split('\n');
      const firstLine = pLines[0].slice(0, 60);
      const lowerP = p.toLowerCase();
      const detectedEntities = PHARMA_ENTITIES.filter((entity) => lowerP.includes(entity));

      sections.push({
        sectionNumber: `${idx + 1}.0`,
        title: firstLine.length < 50 ? firstLine : `Clause ${idx + 1}.0`,
        content: p.trim(),
        startLine: 1,
        wordCount: p.split(/\s+/).filter(Boolean).length,
        keyEntities: detectedEntities,
      });
    });
  }

  return sections;
}

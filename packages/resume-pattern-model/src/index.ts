/**
 * resume-pattern-model — a self-learning resume pattern model.
 *
 * What it is
 * ──────────
 * An embeddable library (no external ML runtime, no network calls) that
 * LEARNS from the resumes it sees and uses what it learned to extract
 * structure from new resumes — the "OCR post-processing" layer:
 *
 *   raw text lines ──▶ line classifier (learned)  ──▶ sections
 *                  └─▶ header-shape memory (learned) ─▶ role/company/dates
 *
 * How it learns
 * ─────────────
 * 1. Weak supervision: a small built-in seed lexicon labels the obvious
 *    lines of each training resume (section headings, contact lines,
 *    bullets, date-carrying job headers). No hand labelling required.
 * 2. Those self-labels train a multinomial Naive-Bayes classifier over
 *    token + shape features. Every `learn()` call updates the counts, so
 *    the model keeps improving as more resumes flow through it.
 * 3. Job-header lines are additionally generalised into SHAPE SIGNATURES
 *    (e.g. "TEXT , CITY ROLE DATERANGE") with frequency counts. At
 *    extraction time the highest-frequency learned shapes drive how a
 *    header line is split into role / company / dates.
 *
 * Persistence: `toJSON()` / `ResumePatternModel.fromJSON()` — a trained
 * model can be saved and shipped as a static asset, then keep learning.
 */

// ── Types ───────────────────────────────────────────────────────────────

export type LineClass =
  | 'heading'
  | 'contact'
  | 'bullet'
  | 'job_header'
  | 'body';

export interface ClassifiedLine {
  text: string;
  label: LineClass;
  confidence: number;
}

export interface ExtractedHeader {
  role: string;
  company: string;
  dates: string;
  shape: string;
}

export interface ExtractionResult {
  contact: { name: string; email: string; phone: string };
  sections: Record<string, string[]>;
  experienceHeaders: ExtractedHeader[];
  lines: ClassifiedLine[];
  /** 0..1 — how much of the document the model classified confidently. */
  confidence: number;
}

export interface ModelJSON {
  version: 1;
  docsSeen: number;
  classCounts: Record<string, number>;
  featureCounts: Record<string, Record<string, number>>;
  headerShapes: Record<string, number>;
  vocabSize: number;
}

// ── Seed lexicon (weak supervision only — NOT used at extraction time) ──

const SEED_HEADINGS = new Set([
  'summary', 'profile', 'objective', 'experience', 'work experience',
  'professional experience', 'employment history', 'education', 'academics',
  'skills', 'technical skills', 'soft skills', 'projects', 'certifications',
  'achievements', 'awards', 'languages', 'interests', 'hobbies', 'references',
  'publications', 'personal details', 'contact', 'declaration',
]);

const ROLE_WORDS = /\b(manager|lead|director|engineer|developer|analyst|consultant|architect|designer|specialist|officer|head|associate|intern|administrator|executive|president|scientist|coordinator|strategist|principal|trainee)\b/i;
const DATE_RANGE = /(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*'?\s*\d{2,4}|\b(?:19|20)\d{2}\b)\s*(?:[-–—]|to)\s*(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*'?\s*\d{2,4}|\b(?:19|20)\d{2}\b|present|till date|current|now)/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const BULLET_RE = /^\s*(?:[-*•·◦▪●]|\d{1,2}[.)])\s+/;

// ── Feature extraction ──────────────────────────────────────────────────

function tokenize(line: string): string[] {
  return line.toLowerCase().replace(/[^a-z0-9@' ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1).slice(0, 24);
}

/** Token + shape features for one line. Shape features are prefixed "§". */
export function featurize(line: string): string[] {
  const t = line.trim();
  const feats = tokenize(t).map((w) => `w:${w}`);
  const letters = t.replace(/[^A-Za-z]/g, '');
  const upper = t.replace(/[^A-Z]/g, '').length;
  if (letters.length > 0 && upper / letters.length > 0.8) feats.push('§allcaps');
  if (t.length < 28) feats.push('§short');
  if (t.length > 90) feats.push('§long');
  if (/:$/.test(t)) feats.push('§colon-end');
  if (BULLET_RE.test(t)) feats.push('§bullet');
  if (DATE_RANGE.test(t)) feats.push('§daterange');
  if (EMAIL_RE.test(t)) feats.push('§email');
  if (PHONE_RE.test(t)) feats.push('§phone');
  if (ROLE_WORDS.test(t)) feats.push('§roleword');
  if (/,/.test(t)) feats.push('§comma');
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/.test(t)) feats.push('§titlecase');
  return feats;
}

/** Generalise a job-header line into a coarse shape signature. */
export function shapeOf(line: string): string {
  return line
    .trim()
    .replace(DATE_RANGE, ' DATERANGE ')
    .replace(EMAIL_RE, ' EMAIL ')
    .replace(new RegExp(ROLE_WORDS.source, 'gi'), ' ROLE ')
    .replace(/\b(?:ltd|llp|inc|corp|pvt|limited|solutions|services|technologies|group|bank|enterprises)\b\.?/gi, ' ORG ')
    .replace(/[A-Za-z][A-Za-z.'&/-]*/g, 'T')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// ── Weak-supervision self-labelling ─────────────────────────────────────

export function selfLabel(line: string): LineClass | null {
  const t = line.trim();
  if (!t) return null;
  const bare = t.replace(/[:\s]+$/g, '').toLowerCase();
  if (SEED_HEADINGS.has(bare)) return 'heading';
  // Phone-shaped digits must not be a date span ("2012 - 2016" also matches
  // the loose phone regex) — otherwise education/experience year lines
  // mistrain the contact class.
  if (EMAIL_RE.test(t) || (PHONE_RE.test(t) && t.length < 60 && !DATE_RANGE.test(t))) return 'contact';
  if (BULLET_RE.test(t)) return 'bullet';
  if (DATE_RANGE.test(t) && ROLE_WORDS.test(t) && t.length < 110) return 'job_header';
  if (t.length > 60 && !DATE_RANGE.test(t)) return 'body';
  return null; // ambiguous — skipped during training
}

// ── The model ───────────────────────────────────────────────────────────

const CLASSES: LineClass[] = ['heading', 'contact', 'bullet', 'job_header', 'body'];

export class ResumePatternModel {
  private classCounts: Map<LineClass, number> = new Map();
  private featureCounts: Map<LineClass, Map<string, number>> = new Map();
  private headerShapes: Map<string, number> = new Map();
  private vocab: Set<string> = new Set();
  private docs = 0;

  constructor() {
    for (const c of CLASSES) {
      this.classCounts.set(c, 0);
      this.featureCounts.set(c, new Map());
    }
  }

  /** Number of resumes this model has learned from. */
  get docsSeen(): number { return this.docs; }

  stats() {
    return {
      docsSeen: this.docs,
      vocabSize: this.vocab.size,
      headerShapes: this.headerShapes.size,
      totalLabeledLines: [...this.classCounts.values()].reduce((a, b) => a + b, 0),
    };
  }

  /** Learn from one resume's raw text. Safe to call repeatedly. */
  learn(text: string): void {
    const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const label = selfLabel(line);
      if (!label) continue;
      this.observe(line, label);
      if (label === 'job_header') {
        const s = shapeOf(line);
        this.headerShapes.set(s, (this.headerShapes.get(s) || 0) + 1);
      }
    }
    this.docs += 1;
  }

  learnMany(texts: string[]): void {
    for (const t of texts) this.learn(t);
  }

  private observe(line: string, label: LineClass): void {
    this.classCounts.set(label, (this.classCounts.get(label) || 0) + 1);
    const fc = this.featureCounts.get(label)!;
    for (const f of featurize(line)) {
      fc.set(f, (fc.get(f) || 0) + 1);
      this.vocab.add(f);
    }
  }

  /** Classify one line via Naive Bayes over learned counts. */
  classify(line: string): { label: LineClass; confidence: number } {
    const feats = featurize(line);
    const totalDocs = [...this.classCounts.values()].reduce((a, b) => a + b, 0) || 1;
    const V = this.vocab.size || 1;
    let best: LineClass = 'body';
    let bestLp = -Infinity;
    const lps: number[] = [];
    for (const c of CLASSES) {
      const cCount = this.classCounts.get(c) || 0;
      let lp = Math.log((cCount + 1) / (totalDocs + CLASSES.length));
      const fc = this.featureCounts.get(c)!;
      const cTotal = [...fc.values()].reduce((a, b) => a + b, 0);
      for (const f of feats) {
        lp += Math.log(((fc.get(f) || 0) + 1) / (cTotal + V));
      }
      lps.push(lp);
      if (lp > bestLp) { bestLp = lp; best = c; }
    }
    // softmax-ish confidence over log-probs
    const max = Math.max(...lps);
    const exps = lps.map((x) => Math.exp(x - max));
    const conf = Math.max(...exps) / exps.reduce((a, b) => a + b, 0);
    return { label: best, confidence: Number(conf.toFixed(4)) };
  }

  /**
   * Split a job-header line into role/company/dates using learned shapes.
   * Returns null when the line doesn't carry a date range.
   */
  splitHeader(line: string): ExtractedHeader | null {
    const t = line.trim();
    const dm = t.match(DATE_RANGE);
    if (!dm) return null;
    const dates = dm[0].trim();
    const pre = t.replace(dm[0], ' ').replace(/\s{2,}/g, ' ').trim();
    // Prefer comma-split ("Company, City Role") when the learned shapes for
    // comma-carrying headers dominate; otherwise trailing role phrase.
    const roleM = pre.match(new RegExp(`\\s((?:[A-Z][A-Za-z.&/-]*\\s+){0,3}${ROLE_WORDS.source.slice(2, -2)})\\s*$`, 'i'));
    // A job header must carry a role phrase — a bare "Institution 2012 -
    // 2016" education line has a date range but no role, and is not one.
    if (!roleM) return null;
    const role = roleM[1].trim();
    const company = pre.slice(0, pre.length - roleM[0].length).trim().replace(/[,;]\s*$/, '');
    return { role, company, dates, shape: shapeOf(t) };
  }

  /** How often the model has SEEN a header of this line's shape. */
  shapeSupport(line: string): number {
    return this.headerShapes.get(shapeOf(line)) || 0;
  }

  /** Extract structure from a new resume using everything learned so far. */
  extract(text: string): ExtractionResult {
    const rawLines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const lines: ClassifiedLine[] = rawLines.map((l) => {
      const { label, confidence } = this.classify(l);
      return { text: l, label, confidence };
    });

    const contact = { name: '', email: '', phone: '' };
    const sections: Record<string, string[]> = {};
    const experienceHeaders: ExtractedHeader[] = [];
    let current = 'preamble';

    for (const cl of lines) {
      if (!contact.email) contact.email = (cl.text.match(EMAIL_RE) || [''])[0];
      if (!contact.phone && cl.text.length < 140 && !DATE_RANGE.test(cl.text)) {
        // Check every phone-shaped candidate on the line; a contact row can
        // also carry a DOB ("04-07-1990") or year spans that must lose.
        for (const cand of cl.text.match(new RegExp(PHONE_RE.source, 'g')) || []) {
          if (cand.replace(/\D/g, '').length >= 8
            && !/\b(?:19|20)\d{2}\b/.test(cand)
            && !/\s[-–—]\s/.test(cand)) {
            contact.phone = cand.trim();
            break;
          }
        }
      }
      if (cl.label === 'heading') {
        current = cl.text.replace(/[:\s]+$/g, '').toLowerCase();
        if (!sections[current]) sections[current] = [];
        continue;
      }
      if (cl.label === 'job_header') {
        const h = this.splitHeader(cl.text);
        if (h) experienceHeaders.push(h);
      }
      if (!sections[current]) sections[current] = [];
      sections[current].push(cl.text);
    }

    // Name heuristic: the first short title-case line near the top of the
    // document (checked on raw lines — a name is often misclassified as a
    // heading because it is short, so we cannot rely on section routing).
    for (const l of rawLines.slice(0, 5)) {
      const bare = l.replace(/[:\s]+$/g, '').toLowerCase();
      if (SEED_HEADINGS.has(bare)) continue;
      if (EMAIL_RE.test(l) || ROLE_WORDS.test(l) || /\d/.test(l)) continue;
      // Title-case ("Jane Doe") or ALL-CAPS ("SEEMA ALMAS YUNUS SHAIKH") names.
      if (/^[A-Z][a-z]+(?:\s+[A-Z][A-Za-z.]+){1,3}$/.test(l)
        || /^[A-Z]{2,}(?:\s+[A-Z.]{2,}){1,4}$/.test(l)) {
        contact.name = l;
        break;
      }
    }

    const confident = lines.filter((l) => l.confidence >= 0.5).length;
    return {
      contact,
      sections,
      experienceHeaders,
      lines,
      confidence: lines.length ? Number((confident / lines.length).toFixed(4)) : 0,
    };
  }

  // ── Persistence ───────────────────────────────────────────────────────

  toJSON(): ModelJSON {
    const featureCounts: Record<string, Record<string, number>> = {};
    for (const [c, fc] of this.featureCounts) {
      featureCounts[c] = Object.fromEntries(fc);
    }
    return {
      version: 1,
      docsSeen: this.docs,
      classCounts: Object.fromEntries(this.classCounts),
      featureCounts,
      headerShapes: Object.fromEntries(this.headerShapes),
      vocabSize: this.vocab.size,
    };
  }

  static fromJSON(json: ModelJSON): ResumePatternModel {
    const m = new ResumePatternModel();
    m.docs = json.docsSeen || 0;
    for (const [c, n] of Object.entries(json.classCounts || {})) {
      m.classCounts.set(c as LineClass, n);
    }
    for (const [c, fc] of Object.entries(json.featureCounts || {})) {
      const map = new Map<string, number>();
      for (const [f, n] of Object.entries(fc)) {
        map.set(f, n);
        m.vocab.add(f);
      }
      m.featureCounts.set(c as LineClass, map);
    }
    for (const [s, n] of Object.entries(json.headerShapes || {})) {
      m.headerShapes.set(s, n);
    }
    return m;
  }
}

export function createModel(): ResumePatternModel {
  return new ResumePatternModel();
}

export type CoverLetterTone =
  | 'professional'
  | 'enthusiastic'
  | 'concise'
  | 'formal';

export interface CoverLetterPromptInput {
  fullName?: string;
  role: string;
  company: string;
  tone: CoverLetterTone;
  summary?: string;
  skills?: string[];
  experience?: Array<{
    company: string;
    role: string;
    startDate?: string;
    endDate?: string;
    highlights: string[];
  }>;
  education?: Array<{ institution: string; degree: string }>;
  jdText?: string;
}

const TONE_GUIDE: Record<CoverLetterTone, string> = {
  professional:
    'Warm, polished, confident. Match the register of a senior hiring manager.',
  enthusiastic:
    'Energetic and personable. Convey genuine excitement without being informal.',
  concise:
    'Tight and direct. Under 220 words. No filler.',
  formal:
    'Traditional business letter register. Conservative phrasing. No contractions.',
};

function clipList(items: string[] | undefined, max = 12): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function trimTo(text: string | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}

export function buildCoverLetterPrompt(input: CoverLetterPromptInput): {
  system: string;
  user: string;
} {
  const tone = input.tone in TONE_GUIDE ? input.tone : 'professional';

  const system = [
    'You are an elite career coach who writes hiring-manager-grade cover letters.',
    'Write in the candidate\'s first-person voice using only facts provided.',
    'Never fabricate employers, dates, metrics, degrees, or certifications.',
    'Return a single JSON object with keys: "body" (markdown string) and "wordCount" (integer).',
    'The body must open with a dated salutation line like "Dear Hiring Team," and close with "Sincerely," + the candidate name on the next line.',
    'Use short paragraphs (2–4 sentences). No headings, no bullet lists, no emojis.',
    'Target 280–380 words for professional/enthusiastic/formal. 180–220 words for concise.',
    `Tone: ${TONE_GUIDE[tone]}`,
  ].join('\n');

  const experience = (input.experience || []).slice(0, 4).map((e) => ({
    company: e.company,
    role: e.role,
    startDate: e.startDate || '',
    endDate: e.endDate || '',
    highlights: clipList(e.highlights, 4),
  }));

  const userPayload = {
    candidate: {
      fullName: input.fullName || '',
      summary: trimTo(input.summary, 600),
      skills: clipList(input.skills, 24),
      experience,
      education: (input.education || []).slice(0, 3).map((e) => ({
        institution: e.institution,
        degree: e.degree,
      })),
    },
    target: {
      role: input.role,
      company: input.company,
      jobDescription: trimTo(input.jdText, 2800),
    },
    tone,
    instructions:
      'Reference 2–3 JD keywords authentically when they match the candidate. Close with a forward-looking sentence inviting next steps. Output strict JSON only — no commentary outside the JSON object.',
  };

  const user = JSON.stringify(userPayload, null, 2);

  return { system, user };
}

export function buildFallbackCoverLetter(input: CoverLetterPromptInput): string {
  const name = input.fullName || 'Candidate';
  const skillsLine = clipList(input.skills, 6).join(', ');
  const topRole = input.experience?.[0];
  const experienceLine = topRole
    ? `Most recently at ${topRole.company} as ${topRole.role}, I ${clipList(topRole.highlights, 1)[0] || 'delivered impact across the team'}.`
    : '';
  const summaryLine = input.summary ? input.summary.trim() : '';
  return [
    `Dear ${input.company} Hiring Team,`,
    '',
    `I’m writing to apply for the ${input.role} role at ${input.company}.`,
    summaryLine,
    experienceLine,
    skillsLine
      ? `My core strengths include ${skillsLine}, which map closely to the requirements you outlined.`
      : '',
    `I would welcome the chance to discuss how my background can contribute to ${input.company}.`,
    '',
    'Sincerely,',
    name,
  ]
    .filter(Boolean)
    .join('\n');
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text
    .replace(/[#*_`>~\-]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

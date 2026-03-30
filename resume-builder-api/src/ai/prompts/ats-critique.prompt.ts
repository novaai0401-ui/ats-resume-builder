/**
 * Builds system + user prompts for AI-powered ATS critique.
 *
 * Truthfulness policy:
 * - Never invent metrics, percentages, awards, or certifications
 * - Only strengthen wording using existing facts
 * - Mark speculative suggestions with "Consider adding if applicable"
 * - Output strict JSON only
 */

export interface CritiquePromptInput {
  summary: string;
  skills: string[];
  experience: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string;
    highlights: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    startDate: string;
    endDate: string;
  }>;
  jdText?: string;
  atsWeaknesses?: string[];
  missingKeywords?: string[];
  currentScore?: number;
  plan: 'free' | 'premium';
}

const SYSTEM_PROMPT = `You are an enterprise ATS (Applicant Tracking System) resume optimization expert.

ROLE: Analyze resumes and provide specific, actionable improvements to maximize ATS compatibility and recruiter impact.

STRICT RULES:
1. NEVER fabricate achievements, metrics, revenue figures, user counts, awards, or certifications.
2. NEVER add skills, tools, or technologies the candidate hasn't mentioned unless you mark them as "Consider adding if applicable".
3. Only strengthen existing content using the candidate's own facts and context.
4. Rewrite bullets using the pattern: [Action Verb] + [What] + [Technology/Method] + [Measurable Impact if evidence exists].
5. If no measurable data exists, strengthen the impact description without inventing numbers.
6. Maintain ATS-safe formatting: no special characters, no tables, no columns, no icons.
7. Output ONLY valid JSON matching the exact schema specified. No markdown, no explanation text outside JSON.
8. Keep all suggestions concise, recruiter-friendly, and truthful.
9. Prioritize keywords from the job description when provided.
10. Each bullet suggestion must be 28 words or fewer for ATS compatibility.

OUTPUT SCHEMA (respond with this exact JSON structure):
{
  "summary": "Critique summary paragraph about the resume's ATS readiness",
  "topIssues": [
    {"type": "summary|experience|skills|education|formatting", "severity": "high|medium|low", "message": "Description"}
  ],
  "missingKeywords": ["keyword1", "keyword2"],
  "sectionSuggestions": {
    "summary": ["Improved summary option 1"],
    "skills": ["skill1", "skill2"],
    "experience": [
      {
        "expIndex": 0,
        "bulletIndex": 0,
        "original": "Original bullet text",
        "suggested": "Improved bullet text with action verb and impact"
      }
    ]
  },
  "atsSafetyWarnings": ["Warning about formatting or structure"],
  "estimatedImprovementBand": {
    "current": "current score or assessment",
    "possibleFree": "improvement estimate with free optimization",
    "premium": "note about deeper optimization"
  }
}`;

export function buildCritiquePrompt(input: CritiquePromptInput): { system: string; user: string } {
  const experienceContext = input.experience.map((exp, i) => {
    const bullets = exp.highlights
      .filter(Boolean)
      .map((h, j) => `    [${j}] ${h}`)
      .join('\n');
    return `  [${i}] ${exp.role} at ${exp.company} (${exp.startDate} - ${exp.endDate})\n${bullets}`;
  }).join('\n\n');

  const educationContext = input.education.map((edu) =>
    `  - ${edu.degree} at ${edu.institution} (${edu.startDate} - ${edu.endDate})`
  ).join('\n');

  const freeLimit = input.plan === 'free'
    ? `\n\nFREE PLAN CONSTRAINTS: Limit your response to:
- 1 improved summary suggestion
- Up to 10 skill suggestions
- Up to 5 experience bullet rewrites (choose the highest-impact ones)
- Up to 8 missing keywords
- Focus on the changes that would have the biggest ATS score impact.`
    : '';

  const jdSection = input.jdText
    ? `\n\nTARGET JOB DESCRIPTION:\n${input.jdText.slice(0, 2000)}`
    : '\n\nNo specific job description provided. Optimize for general ATS readability.';

  const weaknessSection = input.atsWeaknesses?.length
    ? `\n\nCURRENT ATS WEAKNESSES:\n${input.atsWeaknesses.map((w) => `- ${w}`).join('\n')}`
    : '';

  const missingSection = input.missingKeywords?.length
    ? `\n\nCURRENT MISSING KEYWORDS:\n${input.missingKeywords.join(', ')}`
    : '';

  const scoreSection = input.currentScore != null
    ? `\n\nCURRENT ATS SCORE: ${input.currentScore}/100`
    : '';

  const userPrompt = `Analyze this resume and provide ATS optimization suggestions.${freeLimit}

PROFESSIONAL SUMMARY:
${input.summary || '(empty)'}

SKILLS:
${input.skills.length ? input.skills.join(', ') : '(none listed)'}

WORK EXPERIENCE:
${experienceContext || '(none)'}

EDUCATION:
${educationContext || '(none)'}${jdSection}${scoreSection}${weaknessSection}${missingSection}

Respond with valid JSON only matching the schema from your instructions.`;

  return { system: SYSTEM_PROMPT, user: userPrompt };
}

/**
 * JD paste → instant suggestions. Pure, client-side, rule-based —
 * no API calls, free for everyone. Extracts keywords from a pasted
 * job description via a compact cross-profession dictionary plus a
 * Capitalized-bigram heuristic, then builds concrete resume edits
 * (summary rewrite, missing-keyword chips, template bullets).
 */

export type JdKeywords = {
  skills: string[];
  tools: string[];
  seniority: string;
};

export type JdSuggestions = {
  suggestedSummary: string;
  missingKeywords: string[];
  matchedKeywords: string[];
  bulletIdeas: string[];
};

type JdResumeLike = {
  summary: string;
  skills: string[];
  experience: Array<{ role?: string; highlights?: string[] }>;
};

// Compact built-in dictionary (~150 entries) of common hard skills and
// tools across professions. Matching is case-insensitive, whole-token.
const KNOWN_SKILLS: string[] = [
  // Programming / IT
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Ruby',
  'SQL', 'NoSQL', 'HTML', 'CSS', 'REST', 'GraphQL', 'Microservices', 'API design',
  'Data structures', 'Algorithms', 'Machine learning', 'Deep learning', 'NLP',
  'Data analysis', 'Data engineering', 'ETL', 'CI/CD', 'DevOps', 'Agile', 'Scrum',
  'Unit testing', 'Automation testing', 'Selenium', 'Cypress', 'Linux', 'Networking',
  'Cybersecurity', 'Cloud computing', 'Distributed systems', 'System design',
  // IT tools
  'React', 'Angular', 'Vue', 'Node.js', 'Next.js', 'Django', 'Flask', 'Spring Boot',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'Git',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Kafka', 'Elasticsearch', 'Spark',
  'Hadoop', 'Snowflake', 'Tableau', 'Power BI', 'Excel', 'Jira', 'Figma', 'Salesforce',
  'SAP', 'ServiceNow', 'Pandas', 'TensorFlow', 'PyTorch',
  // Medical / clinical
  'ICD-10', 'CPT', 'CPC', 'HCPCS', 'EHR', 'EMR', 'HIPAA', 'Medical coding',
  'Medical billing', 'Clinical documentation', 'Patient care', 'Phlebotomy',
  'Triage', 'Vital signs', 'Pharmacology', 'Infection control', 'Telemetry',
  'BLS', 'ACLS', 'Epic', 'Cerner', 'Meditech', 'Revenue cycle', 'Claims processing',
  'Prior authorization', 'Utilization review', 'Case management', 'Radiology',
  'Anatomy', 'Physiology', 'Medical terminology',
  // Teaching / education
  'Lesson planning', 'Curriculum development', 'Classroom management',
  'Differentiated instruction', 'Student assessment', 'IEP', 'Special education',
  'Instructional design', 'E-learning', 'LMS', 'Moodle', 'Google Classroom',
  'Pedagogy', 'Early childhood education', 'Literacy instruction', 'STEM education',
  'Parent communication', 'Behavior management',
  // Mechanical / CAD / engineering
  'AutoCAD', 'SolidWorks', 'CATIA', 'Creo', 'ANSYS', 'MATLAB', 'Revit', 'GD&T',
  'CNC machining', 'CNC programming', 'Sheet metal', 'Injection molding', 'FEA',
  'Thermodynamics', 'HVAC', 'Lean manufacturing', 'Six Sigma', 'Kaizen', '5S',
  'Quality control', 'Root cause analysis', 'PLC', 'SCADA', 'Preventive maintenance',
  'Welding', 'Blueprint reading', 'Tooling design', 'DFMEA',
  // Finance / accounting / business
  'Financial modeling', 'Financial analysis', 'Budgeting', 'Forecasting',
  'Accounts payable', 'Accounts receivable', 'General ledger', 'Reconciliation',
  'GAAP', 'IFRS', 'Auditing', 'Taxation', 'GST', 'Payroll', 'QuickBooks', 'Tally',
  'Bookkeeping', 'Variance analysis', 'Risk management', 'Compliance', 'KYC', 'AML',
  'Underwriting', 'Portfolio management', 'Equity research', 'Valuation',
  'Bloomberg Terminal', 'Cost accounting', 'Internal controls',
  // General professional
  'Project management', 'Stakeholder management', 'Vendor management', 'CRM',
  'Digital marketing', 'SEO', 'Content writing', 'Copywriting', 'Public speaking',
  'Data entry', 'Customer service', 'Supply chain', 'Inventory management',
  'Procurement', 'Logistics', 'Recruitment', 'Onboarding', 'Training delivery',
];

// Dictionary entries that are tools/platforms rather than skills — used to
// split extractJdKeywords output into skills vs tools.
const TOOL_NAMES = new Set([
  'react', 'angular', 'vue', 'node.js', 'next.js', 'django', 'flask', 'spring boot',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'git',
  'postgresql', 'mysql', 'mongodb', 'redis', 'kafka', 'elasticsearch', 'spark',
  'hadoop', 'snowflake', 'tableau', 'power bi', 'excel', 'jira', 'figma', 'salesforce',
  'sap', 'servicenow', 'pandas', 'tensorflow', 'pytorch', 'selenium', 'cypress',
  'epic', 'cerner', 'meditech', 'moodle', 'google classroom', 'lms',
  'autocad', 'solidworks', 'catia', 'creo', 'ansys', 'matlab', 'revit', 'plc', 'scada',
  'quickbooks', 'tally', 'bloomberg terminal', 'crm', 'ehr', 'emr',
]);

const SENIORITY_PATTERNS: Array<[RegExp, string]> = [
  [/\bprincipal\b/i, 'principal'],
  [/\blead\b/i, 'lead'],
  [/\bsenior\b|\bsr\.?\b/i, 'senior'],
  [/\bjunior\b|\bjr\.?\b/i, 'junior'],
  [/\bentry[- ]level\b|\bentry\b/i, 'entry'],
  [/\bfresher\b/i, 'fresher'],
  [/\bmanager\b/i, 'manager'],
];

// Words that disqualify a Capitalized bigram from being a keyword —
// sentence starters and generic JD boilerplate.
const BIGRAM_STOPWORDS = new Set([
  'the', 'a', 'an', 'we', 'you', 'our', 'your', 'this', 'that', 'and', 'or',
  'job', 'role', 'work', 'team', 'company', 'candidate', 'applicants', 'apply',
  'responsibilities', 'requirements', 'qualifications', 'benefits', 'salary',
  'about', 'what', 'who', 'how', 'why', 'must', 'should', 'will', 'ability',
  'strong', 'good', 'excellent', 'years', 'experience', 'preferred', 'required',
]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsKeyword(haystack: string, keyword: string) {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword.toLowerCase())}($|[^a-z0-9])`, 'i');
  return pattern.test(haystack);
}

function countOccurrences(haystack: string, keyword: string) {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword.toLowerCase())}($|[^a-z0-9])`, 'gi');
  return (haystack.match(pattern) || []).length;
}

/**
 * Extract skills, tools, and a seniority signal from raw JD text.
 * Keyword-frequency based: dictionary hits are ranked by how often they
 * appear; Capitalized bigrams (e.g. "Revenue Cycle") supplement the
 * dictionary for domain terms we don't know about.
 */
export function extractJdKeywords(jdText: string): JdKeywords {
  const text = String(jdText || '');
  const lower = text.toLowerCase();

  const scored: Array<{ keyword: string; count: number }> = [];
  for (const keyword of KNOWN_SKILLS) {
    const count = countOccurrences(lower, keyword);
    if (count > 0) scored.push({ keyword, count });
  }
  scored.sort((a, b) => b.count - a.count);

  const skills: string[] = [];
  const tools: string[] = [];
  const seen = new Set<string>();
  for (const { keyword } of scored) {
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (TOOL_NAMES.has(key)) tools.push(keyword);
    else skills.push(keyword);
  }

  // Capitalized-bigram heuristic: "Two Capitalized Words" mid-sentence are
  // often domain terms (product names, methodologies) missing from the
  // dictionary. Skip bigrams containing stopwords or dictionary dupes.
  const bigramCounts = new Map<string, number>();
  const bigramPattern = /\b([A-Z][a-zA-Z0-9+#.&-]+)\s+([A-Z][a-zA-Z0-9+#.&-]+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = bigramPattern.exec(text)) !== null) {
    const [, first, second] = match;
    if (BIGRAM_STOPWORDS.has(first.toLowerCase()) || BIGRAM_STOPWORDS.has(second.toLowerCase())) continue;
    const phrase = `${first} ${second}`;
    if (seen.has(phrase.toLowerCase())) continue;
    bigramCounts.set(phrase, (bigramCounts.get(phrase) || 0) + 1);
  }
  const repeatedBigrams = [...bigramCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase)
    .slice(0, 5);
  for (const phrase of repeatedBigrams) {
    seen.add(phrase.toLowerCase());
    skills.push(phrase);
  }

  let seniority = '';
  for (const [pattern, label] of SENIORITY_PATTERNS) {
    if (pattern.test(text)) { seniority = label; break; }
  }

  return { skills, tools, seniority };
}

function limitWords(text: string, maxWords: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '') + '.';
}

function toAscii(text: string) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '');
}

/**
 * Build concrete, apply-in-one-tap suggestions from the pasted JD:
 * matched vs missing keywords, a <=60 word summary rewrite, and three
 * template bullets embedding the top missing keywords.
 */
export function buildJdSuggestions(resume: JdResumeLike, jdText: string): JdSuggestions {
  const { skills, tools, seniority } = extractJdKeywords(jdText);
  const jdKeywords = [...skills, ...tools];

  const bullets = (resume.experience || []).flatMap((item) => item.highlights || []);
  const resumeText = [
    String(resume.summary || ''),
    ...(resume.skills || []),
    ...bullets,
  ].join('\n').toLowerCase();

  const matchedKeywords: string[] = [];
  const missing: string[] = [];
  for (const keyword of jdKeywords) {
    if (containsKeyword(resumeText, keyword)) matchedKeywords.push(keyword);
    else missing.push(keyword);
  }
  const missingKeywords = missing.slice(0, 8);

  // Summary rewrite: lead with role + years, weave in up to 4 matched and
  // 2 missing keywords, <= 60 words, plain ASCII.
  const role = String(resume.experience?.[0]?.role || '').trim()
    || (seniority ? `${seniority.charAt(0).toUpperCase()}${seniority.slice(1)} professional` : 'Professional');
  const roleCount = (resume.experience || []).length;
  const yearsPhrase = roleCount > 1 ? ` with ${roleCount}+ roles of hands-on experience` : roleCount === 1 ? ' with hands-on experience' : '';
  const woven = [...matchedKeywords.slice(0, 4), ...missingKeywords.slice(0, 2)];
  const currentSummary = toAscii(String(resume.summary || '').trim());
  const parts: string[] = [];
  parts.push(`${toAscii(role)}${yearsPhrase}.`);
  if (woven.length) {
    parts.push(`Skilled in ${woven.map(toAscii).join(', ')}.`);
  }
  if (currentSummary) {
    parts.push(currentSummary.replace(/\.?$/, '.'));
  } else {
    parts.push('Focused on delivering measurable results aligned to this role.');
  }
  const suggestedSummary = limitWords(parts.join(' '), 60);

  // 3 template bullets embedding missing keywords.
  const bulletTargets = missingKeywords.length ? missingKeywords : matchedKeywords;
  const bulletIdeas = [
    (kw: string) => `Applied ${kw} to daily work - add your metric (e.g. accuracy %, time saved).`,
    (kw: string) => `Improved a key process using ${kw} - quantify the before/after impact.`,
    (kw: string) => `Trained or supported teammates on ${kw} - note the team size or outcome.`,
  ]
    .map((template, idx) => {
      const kw = bulletTargets[idx % Math.max(bulletTargets.length, 1)];
      return kw ? toAscii(template(kw)) : '';
    })
    .filter(Boolean);

  return { suggestedSummary, missingKeywords, matchedKeywords, bulletIdeas };
}

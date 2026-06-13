/**
 * Distilled 2026 skill-demand dataset — the free-tier fallback.
 *
 * Hand-curated from market research (AI/ML featured in ~89% of postings with a
 * $30–50k premium; cloud, data engineering, cybersecurity, and DevOps leading
 * hiring). Free users get this static snapshot with an upsell to real-time,
 * AI-personalized analysis; paid users get the LLM path instead.
 *
 * Kept deliberately small and pure so it unit-tests cleanly and is cheap to
 * keep current. Companies are illustrative well-known employers (global + India,
 * since the product is India-first), not live openings.
 */

export type DemandLevel = 'very-high' | 'high' | 'moderate' | 'stable';

export interface SkillDemand {
  /** Canonical display name. */
  skill: string;
  demand: DemandLevel;
  /** Short human note on the trend. */
  trend: string;
  /** Adjacent skills worth learning next to compound value. */
  alsoLearn: string[];
  /** Illustrative employers actively hiring for this skill area. */
  companiesHiring: string[];
}

/** The headline "hot right now" list shown to everyone. */
export const TOP_IN_DEMAND_2026: string[] = [
  'AI/ML', 'Generative AI / LLMs', 'Prompt Engineering', 'Cloud (AWS/Azure/GCP)',
  'Data Engineering', 'Cybersecurity', 'DevOps / Platform', 'Kubernetes',
  'Python', 'Data Analytics',
];

const GLOBAL_AI = ['Google', 'Microsoft', 'OpenAI', 'Nvidia', 'Amazon'];
const INDIA_PRODUCT = ['Flipkart', 'Razorpay', 'Zomato', 'Swiggy', 'PhonePe'];
const SERVICES = ['TCS', 'Infosys', 'Accenture', 'Wipro', 'Cognizant'];

/**
 * Demand table keyed by a normalized skill token. Entries cover the skills our
 * audience most commonly lists; anything not found falls back to a generic
 * "stable" assessment so the feature never returns nothing.
 */
const DEMAND_TABLE: Record<string, SkillDemand> = {
  'machine learning': { skill: 'Machine Learning', demand: 'very-high', trend: '74% YoY growth; ~56% pay premium', alsoLearn: ['PyTorch', 'MLOps', 'LLMs'], companiesHiring: GLOBAL_AI },
  'ml': { skill: 'Machine Learning', demand: 'very-high', trend: '74% YoY growth; ~56% pay premium', alsoLearn: ['PyTorch', 'MLOps', 'LLMs'], companiesHiring: GLOBAL_AI },
  'ai': { skill: 'AI/ML', demand: 'very-high', trend: 'In ~89% of new tech postings', alsoLearn: ['RAG', 'Prompt Engineering', 'Python'], companiesHiring: GLOBAL_AI },
  'llm': { skill: 'LLMs / Generative AI', demand: 'very-high', trend: 'Fastest-growing specialty', alsoLearn: ['RAG', 'Vector DBs', 'Agents'], companiesHiring: GLOBAL_AI },
  'rag': { skill: 'RAG', demand: 'very-high', trend: 'Core of most GenAI products', alsoLearn: ['Vector DBs', 'LLMs', 'Embeddings'], companiesHiring: [...GLOBAL_AI, ...INDIA_PRODUCT].slice(0, 5) },
  'prompt engineering': { skill: 'Prompt Engineering', demand: 'high', trend: 'Now expected of all knowledge workers', alsoLearn: ['LLMs', 'Evals', 'Python'], companiesHiring: GLOBAL_AI },
  'python': { skill: 'Python', demand: 'very-high', trend: 'Default language for AI/data', alsoLearn: ['Pandas', 'FastAPI', 'ML'], companiesHiring: [...GLOBAL_AI, ...INDIA_PRODUCT].slice(0, 5) },
  'aws': { skill: 'AWS', demand: 'high', trend: 'Cloud roles pay six figures', alsoLearn: ['Terraform', 'Kubernetes', 'DevOps'], companiesHiring: [...INDIA_PRODUCT, 'Amazon'] },
  'azure': { skill: 'Azure', demand: 'high', trend: 'Enterprise cloud demand strong', alsoLearn: ['Terraform', 'Kubernetes', 'DevOps'], companiesHiring: ['Microsoft', ...SERVICES] },
  'gcp': { skill: 'GCP', demand: 'high', trend: 'Growing with AI workloads', alsoLearn: ['Kubernetes', 'BigQuery', 'Terraform'], companiesHiring: ['Google', ...INDIA_PRODUCT].slice(0, 5) },
  'kubernetes': { skill: 'Kubernetes', demand: 'high', trend: 'Platform engineering standard', alsoLearn: ['Docker', 'Terraform', 'Observability'], companiesHiring: [...INDIA_PRODUCT, ...GLOBAL_AI].slice(0, 5) },
  'docker': { skill: 'Docker', demand: 'high', trend: 'Baseline for modern delivery', alsoLearn: ['Kubernetes', 'CI/CD', 'AWS'], companiesHiring: INDIA_PRODUCT },
  'devops': { skill: 'DevOps', demand: 'high', trend: 'Shifting to platform engineering', alsoLearn: ['Kubernetes', 'Terraform', 'SRE'], companiesHiring: [...INDIA_PRODUCT, ...SERVICES].slice(0, 5) },
  'terraform': { skill: 'Terraform', demand: 'high', trend: 'IaC is table stakes', alsoLearn: ['AWS', 'Kubernetes', 'DevOps'], companiesHiring: INDIA_PRODUCT },
  'data engineering': { skill: 'Data Engineering', demand: 'high', trend: '~34% growth projected this decade', alsoLearn: ['Spark', 'Airflow', 'dbt'], companiesHiring: [...INDIA_PRODUCT, ...GLOBAL_AI].slice(0, 5) },
  'sql': { skill: 'SQL', demand: 'high', trend: 'Universal data skill', alsoLearn: ['Python', 'dbt', 'Data Modeling'], companiesHiring: [...INDIA_PRODUCT, ...SERVICES].slice(0, 5) },
  'spark': { skill: 'Apache Spark', demand: 'high', trend: 'Big-data processing staple', alsoLearn: ['Airflow', 'Scala', 'dbt'], companiesHiring: INDIA_PRODUCT },
  'cybersecurity': { skill: 'Cybersecurity', demand: 'very-high', trend: '3.4M global talent gap', alsoLearn: ['Cloud Security', 'SIEM', 'Pentesting'], companiesHiring: [...SERVICES, 'Microsoft'] },
  'security': { skill: 'Security', demand: 'very-high', trend: '3.4M global talent gap', alsoLearn: ['Cloud Security', 'SIEM', 'IAM'], companiesHiring: [...SERVICES, 'Microsoft'] },
  'react': { skill: 'React', demand: 'high', trend: 'Dominant front-end library', alsoLearn: ['TypeScript', 'Next.js', 'Testing'], companiesHiring: INDIA_PRODUCT },
  'typescript': { skill: 'TypeScript', demand: 'high', trend: 'Default for serious JS work', alsoLearn: ['React', 'Node.js', 'Next.js'], companiesHiring: INDIA_PRODUCT },
  'javascript': { skill: 'JavaScript', demand: 'high', trend: 'Ubiquitous; pair with TS', alsoLearn: ['TypeScript', 'React', 'Node.js'], companiesHiring: INDIA_PRODUCT },
  'node.js': { skill: 'Node.js', demand: 'high', trend: 'Common back-end runtime', alsoLearn: ['TypeScript', 'AWS', 'Microservices'], companiesHiring: INDIA_PRODUCT },
  'java': { skill: 'Java', demand: 'high', trend: 'Enterprise backbone', alsoLearn: ['Spring', 'Microservices', 'Kafka'], companiesHiring: [...SERVICES, ...INDIA_PRODUCT].slice(0, 5) },
  'data analytics': { skill: 'Data Analytics', demand: 'high', trend: 'Decision-making backbone', alsoLearn: ['SQL', 'Python', 'Power BI'], companiesHiring: [...SERVICES, ...INDIA_PRODUCT].slice(0, 5) },
};

/** Normalize a free-text skill to a lookup key. */
export function normalizeSkillKey(skill: string): string {
  return String(skill ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Look up a single skill's demand, with a graceful generic fallback. */
export function lookupSkillDemand(skill: string): SkillDemand {
  const key = normalizeSkillKey(skill);
  const hit = DEMAND_TABLE[key];
  if (hit) return hit;
  const display = key ? key.replace(/\b\w/g, (c) => c.toUpperCase()) : 'This skill';
  return {
    skill: display,
    demand: 'stable',
    trend: 'Steady demand; pairing it with an AI or cloud skill raises your market value.',
    alsoLearn: ['AI/ML', 'Cloud', 'Python'],
    companiesHiring: SERVICES,
  };
}

/** Build the full rule-based report for a set of skills (deduped, capped). */
export function analyzeSkillsRuleBased(skills: string[]): SkillDemand[] {
  const seen = new Set<string>();
  const out: SkillDemand[] = [];
  for (const raw of skills || []) {
    const key = normalizeSkillKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(lookupSkillDemand(raw));
    if (out.length >= 15) break;
  }
  return out;
}

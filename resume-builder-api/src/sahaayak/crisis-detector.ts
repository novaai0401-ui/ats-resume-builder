/**
 * Crisis detector — rule-based screening for despair / self-harm language.
 *
 * Design principles:
 * - HIGH recall, accept some false positives. The cost of missing a real
 *   crisis is enormous; the cost of surfacing a helpline to someone who
 *   didn't need it is small.
 * - Never block the conversation. We RAISE the flag, surface resources,
 *   and continue listening. Silencing a user in distress is harm.
 * - Country-aware: India is the primary market (Razorpay / Indian fixtures
 *   throughout the codebase). We surface India resources first, then global
 *   numbers as a fallback.
 *
 * The signals here intentionally overlap. A message that trips ANY of them
 * sets the flag. Tune by adding more phrases, never by trimming.
 */

export interface CrisisDetection {
  flag: boolean;
  /** Which signal(s) tripped, for logging — never shown to user. */
  signals: string[];
  /** Resources to surface, ordered most-relevant first. */
  resources: CrisisResource[];
}

export interface CrisisResource {
  region: 'IN' | 'US' | 'UK' | 'GLOBAL';
  name: string;
  phone?: string;
  hours: string;
  notes?: string;
}

const SIGNALS: Array<{ id: string; re: RegExp }> = [
  // Direct self-harm ideation
  { id: 'suicide-ideation', re: /\b(kill myself|end my life|don'?t want to (live|be here|exist)|want to die|wish i (was|were) dead|take my (own )?life)\b/i },
  { id: 'self-harm', re: /\b(hurt myself|cut myself|self[- ]harm)\b/i },
  { id: 'no-way-out', re: /\b(no (way )?out|no point|no reason to (live|go on)|can'?t (go on|do this anymore))\b/i },
  // Hopelessness clusters
  { id: 'hopeless', re: /\b(hopeless|worthless|useless|nothing matters|everyone'?s better off without me|burden to (everyone|my family))\b/i },
  // Method language (high-signal even without explicit ideation)
  { id: 'method', re: /\b(overdose|jump (off|from)|hang(ing)? myself)\b/i },
  // Layoff-specific despair — context matters here
  { id: 'layoff-despair', re: /\b(lost (my )?job.{0,40}(no point|can'?t go on|don'?t see))\b/i },
];

const RESOURCES_BY_REGION: Record<string, CrisisResource[]> = {
  IN: [
    { region: 'IN', name: 'iCall (TISS)', phone: '+91 9152987821', hours: 'Mon–Sat, 8am–10pm IST', notes: 'Free, confidential, multilingual.' },
    { region: 'IN', name: 'Vandrevala Foundation', phone: '1860-2662-345', hours: '24/7', notes: 'Free mental-health helpline.' },
    { region: 'IN', name: 'AASRA', phone: '+91 9820466726', hours: '24/7', notes: 'Suicide prevention.' },
  ],
  US: [
    { region: 'US', name: '988 Suicide & Crisis Lifeline', phone: '988', hours: '24/7' },
  ],
  UK: [
    { region: 'UK', name: 'Samaritans', phone: '116 123', hours: '24/7' },
  ],
};

const GLOBAL_FALLBACK: CrisisResource = {
  region: 'GLOBAL',
  name: 'Find a Helpline (findahelpline.com)',
  hours: 'Varies by country',
  notes: 'Searchable directory of crisis lines worldwide.',
};

export function detectCrisis(message: string, region: string = 'IN'): CrisisDetection {
  const text = String(message || '');
  const tripped: string[] = [];
  for (const sig of SIGNALS) {
    if (sig.re.test(text)) tripped.push(sig.id);
  }
  if (tripped.length === 0) {
    return { flag: false, signals: [], resources: [] };
  }
  const regional = RESOURCES_BY_REGION[region.toUpperCase()] || RESOURCES_BY_REGION.IN;
  return {
    flag: true,
    signals: tripped,
    resources: [...regional, GLOBAL_FALLBACK],
  };
}

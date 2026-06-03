/**
 * Sahaayak offline companion.
 *
 * When the LLM provider is unavailable (no GROQ_API_KEY, network
 * failure, timeout), Sahaayak must STILL feel like a present, caring
 * friend — never a robot echoing the user's words back. The previous
 * fallback ("I'm listening. You said '<x>'. Tell me more…") repeated
 * verbatim every turn and felt worse than silence.
 *
 * This module produces a warm, varied, sentiment-aware reflection with
 * NO LLM call. It is intentionally simple and fully deterministic given
 * a seed, so it is easy to test and never crashes.
 *
 * Design rules (mirror the LLM persona in sahaayak.prompt.ts):
 *   - Reflect the FEELING, not the literal words.
 *   - One short, open, gentle question.
 *   - No empty validation ("you're amazing", "you've got this").
 *   - Karmayoga lens only when mode === 'karmayoga', and only as a
 *     gentle aside — never a sermon, never Sanskrit unprompted.
 *   - Never repeat the same line two turns running (seed rotates).
 */

export type CompanionMode = 'witness' | 'coach' | 'karmayoga';

export type Sentiment = 'positive' | 'down' | 'anxious' | 'neutral';

const POSITIVE_MARKERS = [
  'happy', 'excited', 'great', 'good news', 'got the job', 'offer',
  'interview', 'cleared', 'selected', 'passed', 'celebrate', 'joy',
  'grateful', 'thankful', 'proud', 'relieved', 'finally', 'wonderful',
  'amazing day', 'best', 'love', 'win', 'won', 'accepted',
];

const DOWN_MARKERS = [
  'sad', 'rejected', 'rejection', 'depressed', 'down', 'lost', 'alone',
  'lonely', 'tired', 'exhausted', 'burnt out', 'burnout', 'hopeless',
  'worthless', 'failed', 'failure', 'give up', 'giving up', 'no point',
  'cry', 'crying', 'hurt', 'broken', 'defeated', 'stuck', 'empty',
];

const ANXIOUS_MARKERS = [
  'anxious', 'anxiety', 'worried', 'worry', 'scared', 'afraid', 'fear',
  'nervous', 'panic', 'overwhelmed', 'stress', 'stressed', 'pressure',
  'uncertain', 'confused', 'what if', 'cant sleep', "can't sleep",
  'restless', 'dread',
];

export function detectSentiment(text: string): Sentiment {
  const t = String(text || '').toLowerCase();
  const score = (markers: string[]) => markers.reduce((n, m) => (t.includes(m) ? n + 1 : n), 0);
  const pos = score(POSITIVE_MARKERS);
  const down = score(DOWN_MARKERS);
  const anx = score(ANXIOUS_MARKERS);
  const max = Math.max(pos, down, anx);
  if (max === 0) return 'neutral';
  // Down feelings take precedence over anxious, anxious over positive,
  // so a "happy but scared" message lands on the heavier emotion.
  if (down === max) return 'down';
  if (anx === max) return 'anxious';
  return 'positive';
}

// Pools of warm, human reflections per sentiment. Each ends with one
// open question. No empty validation. Kept short (2-3 sentences).
const RESPONSES: Record<Sentiment, string[]> = {
  positive: [
    "That's genuinely good to hear — I can feel the lift in your words. What made today land this way for you?",
    "It sounds like something opened up for you today. What part of it feels best right now?",
    "I'm glad this moment came. Hold onto it for a second — what does it tell you about what you want?",
    "That spark matters, especially in a long search. Who would you most want to share this with?",
    "Good moments deserve to be noticed, not rushed past. What did it take to get here?",
  ],
  down: [
    "That sounds heavy, and it makes sense that it's weighing on you. You don't have to explain it perfectly — what's sitting with you most right now?",
    "I'm here, and I'm not going anywhere. When did this start feeling this way?",
    "A rejection isn't a verdict on you, even though it can feel exactly like one. What's the hardest part of it tonight?",
    "You carried a lot to even say this out loud. What would feel like a small relief right now — not a fix, just relief?",
    "It's okay to not be okay for a while. What do you need more of right now — to be heard, or to be distracted?",
  ],
  anxious: [
    "That uncertainty is exhausting to hold. What's the worry that keeps circling back the most?",
    "Your mind is trying to protect you by running every scenario — it just doesn't switch off easily. What's one thing that's actually in your hands today?",
    "Breathe with me for a second. Of everything you're carrying, what feels the most urgent to you?",
    "Waiting without answers is its own kind of hard. What would help you feel a little steadier this evening?",
    "It makes sense to feel on edge with so much unsettled. What's the story your fear is telling you right now?",
  ],
  neutral: [
    "I'm here with you. Tell me a little more about where you're at today.",
    "Thanks for sharing that. What's underneath it for you?",
    "I'm listening — properly, not in a hurry. What's been on your mind?",
    "However today is going, I'd like to understand it from your side. What stands out?",
    "Take your time. What feels most important to say right now?",
  ],
};

// Optional karmayoga aside — appended occasionally (not every turn) when
// the user has opted into the Gita lens. Gentle, never preachy, no
// Sanskrit. Indexed by sentiment so it fits the moment.
const KARMAYOGA_ASIDES: Partial<Record<Sentiment, string[]>> = {
  down: [
    "When you're ready: the effort you put in was real and is yours to keep, whatever the outcome decided.",
    "The result isn't the whole measure of you — the showing-up is.",
  ],
  anxious: [
    "Maybe rest the part that's not in your hands, just for tonight, and keep only the next small action.",
    "Do the work that's yours to do; let the timing be the timing.",
  ],
  positive: [
    "Enjoy this fully — and hold it lightly, so the next quiet day doesn't take it away.",
  ],
};

function pick<T>(pool: T[], seed: number): T {
  if (pool.length === 0) return undefined as unknown as T;
  const idx = ((seed % pool.length) + pool.length) % pool.length;
  return pool[idx];
}

export interface CompanionReplyInput {
  userText: string;
  mode?: CompanionMode;
  /** Rotating seed (e.g. message count) so consecutive replies differ. */
  seed?: number;
  /** True when the crisis detector fired — overrides everything. */
  crisis?: boolean;
}

export function companionReply(input: CompanionReplyInput): string {
  if (input.crisis) {
    // Crisis path stays simple, steady, present. Resources are appended
    // by the caller (appendCrisisFooter) — do not list numbers here.
    const crisisLines = [
      "I hear you, and what you're carrying is real. You don't have to hold it alone right now.",
      "I'm right here with you. You reaching out matters more than you know — what's happening for you this moment?",
    ];
    return pick(crisisLines, input.seed ?? 0);
  }

  const sentiment = detectSentiment(input.userText);
  const seed = Number.isFinite(input.seed) ? (input.seed as number) : 0;
  let reply = pick(RESPONSES[sentiment], seed);

  if (input.mode === 'karmayoga') {
    const asides = KARMAYOGA_ASIDES[sentiment];
    // Surface the lens on roughly every other turn, never twice running.
    if (asides && asides.length && seed % 2 === 0) {
      reply = `${reply} ${pick(asides, Math.floor(seed / 2))}`;
    }
  }

  return reply;
}

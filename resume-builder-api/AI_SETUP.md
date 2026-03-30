# AI-Powered ATS Critique Setup

## Overview

The AI Critique feature uses a configurable AI provider (default: GROQ free tier) to generate
ATS-safe resume improvement suggestions. The existing rule-based ATS scoring engine remains
the authoritative source of truth for scores.

## Quick Start

### 1. Get a GROQ API Key (Free)

1. Go to [https://console.groq.com](https://console.groq.com)
2. Sign up / log in
3. Navigate to **API Keys** and create a new key
4. Copy the key

### 2. Configure Environment Variables

Add to your `resume-builder-api/.env`:

```env
AI_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
AI_TIMEOUT_MS=30000
AI_FREE_MAX_REQUESTS_PER_DAY=10
```

### 3. Run Database Migration

```bash
cd resume-builder-api
npx prisma db push
```

This adds the `AiCritiqueLog` table for daily usage tracking.

### 4. Start the App

```bash
# Terminal 1 — Backend
cd resume-builder-api
npm run start:dev

# Terminal 2 — Frontend
cd resume-builder-web
npm run dev
```

### 5. Use AI Critique

1. Open a resume in the editor
2. Fill in required sections (summary, skills, experience, education)
3. Optionally paste a job description in the "Target Job Description" field
4. Click **AI Critique**
5. Review and apply suggestions individually or all at once
6. Click **ATS Score** to see the updated score

## How It Works

- **AI Critique** sends the resume data + optional JD + current ATS weaknesses to the configured AI provider
- The AI returns structured suggestions: summary rewrites, skill additions, bullet improvements, missing keywords
- Users can apply suggestions individually or all at once
- After applying, the existing ATS scoring engine recalculates the score
- Free tier limits: 10 critiques/day, up to 5 bullet rewrites per request

## Fallback Behavior

If the AI provider is unavailable or unconfigured (`GROQ_API_KEY` is empty):
- The system falls back to rule-based suggestions
- A "fallback" badge is shown in the critique panel
- All existing functionality continues to work

## Architecture

```
ai/
  providers/
    ai-provider.interface.ts   # Provider-agnostic interface
    groq.provider.ts           # GROQ (default, free tier)
    xai.provider.ts            # xAI/Grok (feature-flagged, for premium)
  prompts/
    ats-critique.prompt.ts     # Prompt engineering with truthfulness policy
  ai.service.ts                # Service with aiCritique() method
  ai.controller.ts             # POST /ai/ai-critique endpoint
```

## Provider Options

| Provider | Env Vars | Plan | Notes |
|----------|----------|------|-------|
| GROQ | `AI_PROVIDER=groq`, `GROQ_API_KEY` | Free | Default, uses Llama 3.3 70B |
| xAI | `AI_PROVIDER=xai`, `XAI_API_KEY` | Premium (future) | Feature-flagged |

## Truthfulness Policy

The AI is instructed to:
- Never fabricate metrics, percentages, awards, or certifications
- Only strengthen wording using existing facts from the resume
- Mark speculative suggestions as "Consider adding if applicable"
- Keep all bullets under 28 words for ATS compatibility

## ATS Scoring

The existing rule-based ATS scoring engine remains unchanged and authoritative.
AI only suggests content improvements — it does not generate or modify scores.
After applying AI suggestions, users re-run the ATS score to see improvements.

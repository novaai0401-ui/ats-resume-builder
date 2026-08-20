# AI Architecture & Unit Economics

How AI access, cost control, and monetisation fit together — and the plan for
building resumes *inside* external AI platforms (ChatGPT, Claude, etc.).

## 1. The access ladder (per request, per user)

Every AI call resolves through `resolveResumeAiProvider` in this order:

```
BYOK header present ──► user's own key      · uncapped · costs us ₹0
else plan ∈ {STUDENT, PRO} ──► our Groq key · uncapped per-call, monthly token ceiling
else FREE ──► our Groq key                  · 10 calls/day + per-feature trials
no provider at all ──► rule-based baseline  · feature still works, no AI
```

Plan is read from the `User` row per request — never cached, never stamped —
so upgrades, lapses and admin grants (`PATCH /admin/users/plan`) take effect
on the next request.

## 2. Cost controls (src/ai/ai-usage.ts)

| Control | Mechanism | Why |
|---|---|---|
| **Model routing** | `modelForFeature()` — light features (copilot, bullet-rewrite, jd-match, skill-demand) run the 8B model (`AI_MODEL_LIGHT`, default `llama-3.1-8b-instant`); prose features (critique, cover letters, mentor) stay on `GROQ_MODEL` | 8B ≈ ₹0.03/call vs 70B ≈ ₹0.25 — ~70% AI-bill cut on the high-volume paths, invisible where output is short/structured or user-edited |
| **Metering** | `recordAiUsage()` writes `AiTokenUsage` (chars/4 estimate) on every our-key call; BYOK is deliberately not recorded | The table existed with zero writers; ceilings and reports are only as good as recording |
| **PRO/STUDENT ceiling** | `enforcePlanMonthlyTokens()` — monthly sum vs `User.aiTokensLimit`, thrown with a message naming the reset date and the BYOK escape hatch | "Uncapped" is right UX, wrong absolute: one scripted abuser must not turn the best-margin customer negative. Limit lives on the user row so comps/plans differ without deploys |
| **Spend tripwire** | `POST /admin/ops/daily-report` (cron-secret guarded) + `ats-rb-cron-ops` at 08:30 IST — mails yesterday's AI calls/tokens/est-cost, captured revenue, signups, paid-plan count | The failure mode is discovering a bill or abuse a month late. Estimate is a trend line, not an invoice — Groq console remains billing truth |

Adoption status: copilot and bullet-rewriter are fully wired (routing +
metering; copilot also enforces the ceiling). Other AI services adopt the same
three calls as they're touched — the helpers are dependency-free.

## 3. Unit economics (2026 pricing)

Fixed: ~₹1,500–2,000/mo (Render Starter ×2 + crons; Supabase free; domain
amortised). Marginal AI cost: ₹0.03–0.35/call on Groq. Break-even ≈ **4 PRO
subscribers or ~40 downloads/month**. Margins at plan prices: 60–90% even
under abusive usage. The business risk is churn and traffic, not cost.

Monetisation hooks, all implemented:
- ₹49/download (+₹20 AI fee when our AI touched the resume) for FREE users
- STUDENT ₹199+GST, PRO ₹499+GST — uncapped AI, included downloads, portfolio
- BYOK: power users bring their own key — costs us ₹0, removes the AI fee

## 4. Building resumes inside external AI platforms

Goal: a user *in* ChatGPT/Claude/etc. types "build my resume" and it happens
in their CallbackCV account, on their plan, from that platform.

**The foundation already exists**: `resume-builder-mcp` (deployed as
`ats-rb-mcp`) speaks the Model Context Protocol. A user pastes a token from
Settings → API access into their MCP host, and the assistant can do whatever
the user can do — plan limits and quotas apply unchanged, because MCP calls
land on the same API with the same user identity. That is the critical
property: **the subscription model needs no per-platform re-implementation.**

Per-platform strategy:

| Platform | Route | Status / work |
|---|---|---|
| **Claude** (Desktop/Code/web) | MCP — native support | Works today; polish = a `claude.md`-style install snippet + listing in MCP directories |
| **ChatGPT / OpenAI** | MCP (supported in ChatGPT desktop + Agents SDK); fallback: a Custom GPT with Actions pointing at our OpenAPI | MCP path works today; Actions needs an OpenAPI spec generated from the Nest controllers + OAuth or token auth |
| **Groq / others** | Groq is an inference API, not an assistant surface — nothing to plug into. Other MCP-speaking hosts (Cursor, Windsurf, etc.) get the MCP server as-is | Documentation only |

Build order when this phase starts:
1. Audit `resume-builder-mcp`'s tool surface: it must cover create-resume,
   add-section, rewrite-bullet, choose-template, export (which returns the
   payment link for FREE users rather than a free file — the gate must hold
   over MCP exactly as on the web).
2. OpenAPI spec + Custom GPT ("CallbackCV Resume Builder") for the
   ChatGPT-web audience that can't use MCP.
3. A landing page (`/ai-assistants`) with copy-paste setup per platform —
   doubles as SEO for "build resume in ChatGPT/Claude" queries.

The one rule that must survive every integration: **external platforms get the
same API, same identity, same gates.** No side doors — a free export over MCP
would be the payment bypass we just closed on the web.

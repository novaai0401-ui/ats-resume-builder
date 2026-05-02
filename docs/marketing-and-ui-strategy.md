# Pocket Resume — marketing, UI, and SEO strategy

A working playbook, not a vision deck. Each section says what to do
this quarter and why. Adjust based on what data tells you after you
have any.

## 1. Positioning

**One-liner:** *Free ATS-ready resumes that respect your privacy.
Built for students, freshers, and career-changers who can't afford
₹999/month for a resume site.*

**Three pillars** (use everywhere — homepage, app store, ads, Twitter
bio, social cards):

1. **Free to build, ₹49 to download.** No subscription, no upsells.
   This is the single most important thing — every competitor lies
   about "free" and traps you at the export step. Pocket Resume
   is honest: build forever for free, pay once when you actually
   need a copy.
2. **Local-first privacy.** Your resume stays on your phone or
   laptop unless you turn on Cloud sync. We literally cannot read
   what you write. No competitor in this category does this.
3. **ATS-safe by default.** Single-column templates, plain text,
   real headings. The same scoring rules applicant tracking systems
   use, surfaced in your editor.

## 2. Target audiences (in priority order)

### A. Students and freshers in India
- Highest volume, lowest budget, biggest underservice.
- Channels: Instagram Reels, college placement WhatsApp groups,
  LinkedIn student communities, Telegram job-prep channels,
  YouTube Shorts ("how to make a fresher resume in 5 minutes").
- Hook: "Free forever. Pay ₹49 only when you download. No catch."
- Conversion path: Reel → landing → upload existing PDF → see
  ATS score immediately → fix bullets → pay ₹49 → download.

### B. Career-changers and laid-off workers
- High intent, willing to pay small amounts, value privacy.
- Channels: r/india, r/developersIndia, LinkedIn, Twitter/X
  ("recently laid off, here's a resume tool that doesn't store
  your data").
- Hook: "We don't store your resume. We never will."
- Conversion path: organic post → landing → privacy explainer →
  sign up → import → optimize → download.

### C. Working professionals refreshing their resume
- Lowest volume, highest willingness to pay, value polish.
- Channels: Google search ("ATS friendly resume India"), LinkedIn
  posts, Product Hunt-style launches.
- Hook: "Built for recruiters' actual scanners, not what you
  think they look for."

## 3. Channels and tactical playbook

### Free / organic (do this first, weeks 1–4)
- **SEO landing pages** for high-intent queries:
  - "ATS resume builder India"
  - "free resume builder no subscription"
  - "resume builder for freshers"
  - "how to make a one-page resume"
  Each page = real article (~800 words) + screenshot + CTA.
  Targets the long-tail traffic competitors don't bother with.
- **YouTube Shorts** (60-second how-tos):
  - "Why your resume gets rejected in 6 seconds"
  - "ATS keyword cheat sheet for 2026"
  - "Stop using these weak verbs"
  Direct upload + post link in pinned comment.
- **Twitter / X threads** showing a real resume getting scored,
  fixed, and exported in 60 seconds. Visual, screenshot-heavy.
- **LinkedIn posts** every Tuesday — share one bullet rewrite
  (before/after) with ATS scores. Tag the original poster
  asking for permission.
- **WhatsApp / Telegram college groups**: ask a friendly admin
  to share once. Don't spam.

### Paid (only after you have organic traction)
- **Meta (Instagram + Facebook) Reels ads**: ₹500/day budget,
  target 18–24 in India, college students. CPM in India is
  ~₹50, so 10k impressions/day. Optimize for app installs (PWA)
  or website visits.
- **Google Search ads** on "ATS resume builder", "free resume
  maker India" — ₹15–25 per click in India. Spend cap ₹500/day.
- **Reddit promoted posts** in r/india, r/developersIndia,
  r/jobs — only if you have a real story to tell, not a sales
  pitch.

### Don't bother with (yet)
- TikTok (banned in India)
- Influencer sponsorships (need scale first)
- Paid newsletter sponsorships (low ROI for resume tools)
- Quora (spam-flagged, low conversion)

## 4. SEO foundation (already shipped)

The repo now includes:
- `app/layout.tsx` — full `<title>`, description, OG, Twitter,
  canonical, robots tags.
- `app/page.tsx` — proper H1/H2 hierarchy, semantic `<article>`
  tags, internal linking to /resume/start, /templates, /auth/register.
- `app/robots.ts` — allows public marketing surfaces, blocks
  authenticated routes from crawl budget.
- `app/sitemap.ts` — auto-served at /sitemap.xml with the public URLs.
- JSON-LD `SoftwareApplication` + `WebSite` schemas in `<head>`.

### What you do operationally
1. **Submit sitemap to Google Search Console**:
   `https://search.google.com/search-console` →
   add property `https://pocketresume.app` → verify via DNS TXT
   (Render → Custom Domains → DNS settings) → Sitemaps → submit
   `sitemap.xml`.
2. **Same for Bing Webmaster Tools** (covers DuckDuckGo too).
3. **Test rich results**:
   `https://search.google.com/test/rich-results` — paste your
   homepage URL, confirm SoftwareApplication schema is detected.
4. **Set up Plausible or PostHog** (see `analytics-and-monetization.md`)
   to track which pages convert.
5. **Once /blog content exists**, generate dedicated meta tags per
   post (Next.js `generateMetadata` per route). For the first
   90 days, the homepage + `/templates` are enough.

### Content to add (priority order)
1. `/templates` — already exists, but each template needs its own
   page with a real preview and the H1 "Free ATS-friendly
   {{template name}} template". Currently it's a grid; split into
   per-template routes for SEO.
2. `/blog` — start with 5 posts:
   - "ATS resume builder India: free vs paid in 2026"
   - "10 strong action verbs that beat 'responsible for'"
   - "How to write a fresher resume with no work experience"
   - "Resume keywords for software engineers (with examples)"
   - "Why your resume isn't getting interviews — and how to fix it"
3. `/career-paths/{{role}}` — landing per role. Already partially
   stubbed under `/career`; flesh out the top 10 roles with real
   resumes and skill maps.

## 5. UI improvements (surgical, not a redesign)

The current UI works — don't rewrite it. These are the highest-
impact tweaks ranked by friction reduction:

### Already shipped this branch
- Bullet inputs are now `<textarea>` so mobile users can see and
  edit full sentences (was `<input>` with truncation).
- Date label says "Start month" + tap hint, with 44pt tap target.
- Privacy badges on Upload, Dashboard, Login, Download.
- Homepage rewritten with clearer hero + four-card value prop +
  CTA repeat at the bottom.

### Next quarter (do these in order)

1. **Onboarding tour** — first-launch overlay on /resume/start
   that walks through Upload → Edit → ATS → Download. Use a
   tiny library like `react-joyride` (~10 KB), 4 steps max.
   Conversion impact: documented +20% activation in similar SaaS.

2. **"Why your score is 45" inline explainer** — every ATS score
   should show one sentence: "You'd score higher if you added 3
   more action verbs and 2 missing keywords." Not buried in the
   modal — right next to the score number.

3. **Mobile bottom-tab nav** — current top nav becomes a hamburger
   on mobile. Replace with a bottom tab bar (Editor / ATS /
   Templates / Profile) so the most-used routes are one tap from
   any screen. The mobile app already uses this pattern.

4. **Empty state for Dashboard** — when a user has zero resumes,
   show a single "Start your resume" CTA centered on the page
   instead of the "No resume selected" dropdown. Less friction,
   higher conversion.

5. **Inline "Looks good" feedback** — when a bullet passes all
   ATS rules, show a small green check next to it. We already do
   this for bad bullets (red !); show the inverse so users feel
   the progress.

6. **Templates preview on hover** — desktop only; tap on mobile.
   Current grid shows a static name; add a real iframe preview
   at 25% scale. Conversion impact: lower bounce on /templates.

7. **Multi-language toggle** — Hindi first, then Tamil, Telugu,
   Bengali, Marathi. The UI strings are mostly in English; using
   `next-intl` with route-based locales (`/hi/dashboard`) covers
   it. Don't translate the resume content — just the chrome.

### Don't do these (they sound good but won't move the needle)
- Dark mode (15% adoption, 0 retention impact, big maintenance cost)
- Animations on the editor (perceived speed wins, novelty doesn't)
- Resume "themes" beyond what we have (more templates ≠ more users
  past 10)
- AI chatbot in the editor (slow, expensive, scary on resume content)

## 6. Trust signals to add to landing pages

These are cheap and high-trust:

```
🔒 Local-first — your resume stays on your device
🚫 No subscription — pay ₹49 only when you download
🇮🇳 Indian payments — Razorpay (UPI, cards, netbanking)
✓ ATS-safe templates — used by 50k+ recruiters' tools
📱 One account — same data on phone, laptop, and tablet
```

Real numbers come once you have them — don't fake the recruiter
count. Until then say "ATS-safe by recruiter standards" without
a number.

## 7. Pricing experiments to run later

Current: free build + ₹49 per download.

After 1,000 paying users, A/B test:
- ₹49 vs ₹99 per download (price elasticity)
- ₹49 + ₹199/month unlimited downloads (mixed model)
- Free first download, ₹49 from second onwards (try-before-you-buy)
- Pay-what-you-want with ₹49 minimum (psychological)

**Don't change pricing before 1,000 paying users.** You don't have
enough signal to know what works.

## 8. What success looks like

| Metric | Month 1 | Month 3 | Month 6 |
| --- | --- | --- | --- |
| Sign-ups | 100 | 1,000 | 10,000 |
| Free → paid conversion | 1% | 3% | 5% |
| Paying users / month | 1 | 30 | 500 |
| Revenue / month | ₹49 | ₹1,470 | ₹24,500 |
| Organic traffic / month | 500 | 5k | 30k |
| App installs (PWA) | 10 | 200 | 2,000 |

These are conservative — most resume tools that nail positioning
hit 5–10% paid conversion at scale. If you stay below 1% by month
3, your value prop isn't landing — fix the homepage copy and
onboarding first, not the price.

## 9. The dharma framing (Bhagavad Gita, applied)

> कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।  
> *karmaṇy-evādhikāras te mā phaleṣu kadāchana*

You have the right to do the work, not to grasp at its fruits.

Translated to product:
- **Build the right thing** (privacy-first, ATS-correct, free to
  start) without obsessing over conversion numbers in week 1.
- **Don't sell users' data**. Most "free" resume tools monetize by
  selling profile data to recruiters. Pocket Resume doesn't, and
  doesn't have to.
- **Charge a small honest price** when users get real value. ₹49
  is less than a chai + samosa in most Indian cities. Honest
  exchange, no upsell traps.
- **The fruits will come**. Privacy-first products with honest
  pricing find their audience because the audience is starving
  for them. You don't need to be loud — you need to be true.

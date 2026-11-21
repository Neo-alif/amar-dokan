# আমার দোকান (Amar Dokan)

**Your Business, Understood by AI.**

A Bangla-first AI business assistant for small retailers in Bangladesh. The shopkeeper speaks or types a sentence in Bangla or Banglish; AI turns it into a draft transaction, the owner confirms it, and the backend updates sales, stock and dues.

> 🚧 Work in progress — built for **CoU AI Hackathon 2026** (pre-build 21–23 Nov, final 24 Nov 2026).

- **Domain:** FinTech (primary) · Business and Industry (secondary)
- Repository created 21 Nov 2026, 01:12 Dhaka time (UTC+6) (GitHub displays UTC: 20 Nov, 19:12).
- **Live link (backup):** https://amar-dokan-iota.vercel.app/ — the demo runs locally (`npm run build && npm start`)
- **Demo video:** _TBD_

## Team

| Name | GitHub | Role |
|---|---|---|
| Alif | [Neo-alif](https://github.com/Neo-alif) | Solo developer |

## Problem

Small shopkeepers run their business with a paper *khata*, mental math and a calculator. It is slow and error-prone, and they have no clear picture of who owes what or which items are about to run out. Existing POS apps are form-heavy and English-only, so many owners don't use them.

## Solution

_TBD — filled in as features land._ Planned: voice/text entry → AI extraction → confirm card → deterministic ledger update; dashboard, dues (baki khata), low-stock alerts, 7-day forecast, budget-based restock plan, daily Bangla insight.

## How the AI works

_TBD — pipeline diagram once built (see `docs/TRD.md` §4)._

Core rule: **the LLM only understands language; the backend and database do all money and stock math.** Nothing is saved until the owner confirms.

## Tech stack

- Next.js 16 (App Router) + TypeScript, Tailwind CSS
- Supabase (PostgreSQL)
- Zod (validation)
- Gemini `gemini-3.1-flash-lite` (primary LLM), Groq `qwen/qwen3.8-27b` (live fallback LLM). Model names are config in `.env.local`.
- Hosting: Vercel

## Dataset

All demo data is **synthetic and self-generated** — no real shop or customer data.

- `data/products.json`: 25 generic grocery products (no brands) with Bangla/English names, Banglish aliases, cost and sell prices.
- `data/seed.ts` (`npm run seed`): a simulated 60-day shop — weekday sales pattern, credit sales and repayments for 9 fictional customers, restock purchases, monthly rent/electricity and small expenses; 3 products deliberately end low on stock for the demo. Every row is written through the same `apply_transaction` DB function the app uses, and the script checks that the DB's stock and dues match its own simulation.
- Re-running the seed deletes and rebuilds **only** the demo shop (`DEMO_SHOP_ID`).

## AI disclosure

| Tool / model | Used for |
|---|---|
| Claude Code (Anthropic, Claude Opus 5.5) | Planning, documentation and code assistance during development |
| Google Gemini `gemini-3.1-flash-lite` | Runtime: transaction extraction, daily insight and monthly audit summary (live inference) |
| Groq-hosted `qwen/qwen3.8-27b` | Runtime: live fallback when Gemini is unavailable |

UI mockup designed with Claude (Design canvas).

No AI output in this app is hard-coded, cached or pre-recorded. If both providers fail, the UI says AI is unavailable and the owner fills the card by hand.

## Third-party code and assets

- Project scaffolded with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- _TBD — libraries, fonts (Hind Siliguri, Inter) and icons will be credited here._

## Setup

```bash
git clone https://github.com/Neo-alif/amar-dokan.git
cd amar-dokan
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000 (development)
```

Demo / production run (how the prototype is shown):

```bash
npm run build && npm start   # http://localhost:3000
```

## Docs

Design docs live in [`docs/`](docs/): PRD, AppFlow, UIspec, TRD, Schema, Plan.

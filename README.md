# আমার দোকান (Amar Dokan)

**Your Business, Understood by AI.**

A Bangla-first AI business assistant for small retailers in Bangladesh. The shopkeeper speaks or types a sentence in Bangla or Banglish; AI turns it into a draft transaction, the owner confirms it, and the backend updates sales, stock and dues.

> Built for **CoU AI Hackathon 2026** (pre-build 21–23 Nov, final 24 Nov 2026).

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

The owner says one sentence in Bangla or Banglish, e.g. *"Rahim vai ke 2 ta soyabin tel dilam, 680 taka, 100 taka baki"*. AI turns it into a draft transaction, the owner checks it on a confirm card, and one database function updates sales, stock and the customer's due together. On top of that ledger the app forecasts stock, plans a restock within a budget and writes a short Bangla summary — all from verified numbers.

## Features

| Feature | Where |
|---|---|
| Voice (Web Speech `bn-BD`) or text entry → AI draft → editable confirm card → save | `/entry` |
| Sale, purchase, expense and customer payment; partial due, change on over-payment; new product/customer badges | confirm card |
| Home: today's sales/spend, total due, low stock, weekly profit, "এখন যা করবেন" actions, monthly AI audit with today's summary | `/` |
| Due book (baki khata): every customer, ledger, take a payment | `/dues` |
| Stock: SES × weekday forecast, "X দিন চলবে", low-stock status | `/stock` |
| Restock plan inside a budget, ranked with reasons | `/restock` |
| Printable monthly report (PDF via the browser) | `/report` |

## How the AI works

```
voice/text ─► normalize (Bangla digits, number words, units, max 500 chars)
           ─► Gemini (structured JSON output) ──fail/429/timeout──► Groq (JSON mode)   ← both live inference
           ─► Zod validation (1 retry) ─► the LLM only reports *said* values (qty, price, paid, due said)
           ─► deterministic code: line totals, total, paid/due, product & customer matching
           ─► missing price → clarify question ─► confirm card (owner edits/confirms)
           ─► POST /api/transactions: Zod again ─► apply_transaction() in Postgres
              (one atomic function: recomputes money, moves stock and dues, idempotency key)
```

Core rule: **the LLM only understands language; the backend and database do all money and stock math.** Nothing is saved until the owner confirms. The daily/monthly insight works the same way: code computes the numbers, the LLM writes the sentence, and a number check rejects any sentence that contains a number not in the data (then a plain template is shown, labelled as not AI).

If both LLMs fail, the app says AI is unavailable and the owner fills the card by hand. No AI output is ever hard-coded, cached or pre-recorded.

**Forecast:** simple exponential smoothing (α = 0.3) × weekday factor over the last 8 weeks; fewer than 14 days of data → "শিখছি" (learning). **Restock:** most urgent first, two-pass greedy so one item can't eat the budget.

## Test results

| Test | Command | Result |
|---|---|---|
| Live extraction accuracy, 30 Banglish sentences (type + items + quantities + prices must all match) | `npm run test:extract` | **29/30 = 96.7%** (22 Nov 2026; Gemini answered 27, Groq fallback 3) |
| Groq-only run on 5 hard cases | `npm run test:extract` (Gemini key removed) | 3/5 = 60% |
| Deterministic logic unit tests (amounts, matching, normalize, forecast, restock, summary, number check) | `npm run test:logic` | 32/32 pass |
| Database tests (sale + due, duplicate key, over-payment, anon/authenticated denied, least privilege) | `supabase/tests/001_init_test.sql` in the SQL Editor | 10/10 PASS |

Raw results: `tests/results.json`, `tests/results-groq.json`.

## Tech stack

- Next.js 16 (App Router) + TypeScript, Tailwind CSS 4
- Supabase (PostgreSQL): RLS on, no browser access; all writes through server API routes and one `apply_transaction` SQL function
- Zod 4 (validation; the same schema becomes Gemini's JSON schema via `z.toJSONSchema`)
- Gemini `gemini-3.1-flash-lite` via `@google/genai` (primary LLM), Groq `qwen/qwen3.8-27b` via `groq-sdk` (live fallback). Model names are config in `.env.local`.
- Web Speech API (`bn-BD`, Chrome) for voice — no server cost
- Hosting: local `npm run build && npm start` for the demo; Vercel (`sin1`, same region as Supabase Singapore) as backup

## Dataset

All demo data is **synthetic and self-generated** — no real shop or customer data.

- `data/products.json`: 25 generic grocery products (no brands) with Bangla/English names, Banglish aliases, cost and sell prices.
- `data/seed.ts` (`npm run seed`): a simulated 60-day shop — weekday sales pattern, credit sales and repayments for 9 fictional customers, restock purchases, monthly rent/electricity and small expenses; 3 products deliberately end low on stock for the demo. Every row is written through the same `apply_transaction` DB function the app uses, and the script checks that the DB's stock and dues match its own simulation.
- Re-running the seed deletes and rebuilds **only** the demo shop (`DEMO_SHOP_ID`).
- `tests/banglish-cases.json`: test sentences written by us.

## AI disclosure

| Tool / model | Used for |
|---|---|
| Claude Code (Anthropic, Claude Opus 5.5) | Development: planning, documentation, code writing and review, tests |
| Claude Design canvas (Anthropic) | UI mockups (`docs/mockup/*.dc.html`) and the logo |
| Google Gemini `gemini-3.1-flash-lite` | Runtime: transaction extraction, daily insight and monthly audit summary (live inference) |
| Groq-hosted `qwen/qwen3.8-27b` | Runtime: live fallback when Gemini is unavailable |

No AI output in this app is hard-coded, cached or pre-recorded. If both providers fail, the UI says AI is unavailable and the owner fills the card by hand.

## Third-party code and assets

- Project scaffolded with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) (MIT)
- Libraries: Next.js, React (MIT), Tailwind CSS (MIT), Zod (MIT), `@supabase/supabase-js` (MIT), `@google/genai` (Apache-2.0), `groq-sdk` (Apache-2.0)
- Fonts: [Hind Siliguri](https://fonts.google.com/specimen/Hind+Siliguri) and [Inter](https://fonts.google.com/specimen/Inter) (SIL Open Font License), loaded with `next/font`
- Icons: simple inline SVGs drawn for this project (no icon library)

## Setup

```bash
git clone https://github.com/Neo-alif/amar-dokan.git
cd amar-dokan
npm install
cp .env.example .env.local   # then fill in the keys
# Supabase SQL Editor: run supabase/migrations/*.sql in order
npm run seed                 # synthetic 60-day demo shop
npm run dev                  # http://localhost:3000 (development)
```

Demo / production run (how the prototype is shown):

```bash
npm run build && npm start   # http://localhost:3000
```

## Docs

Design docs live in [`docs/`](docs/): PRD, AppFlow, UIspec, TRD, Schema, Plan; build progress in [`docs/STATUS.md`](docs/STATUS.md).

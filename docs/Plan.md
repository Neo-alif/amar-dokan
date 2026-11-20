# Plan — Amar Dokan

> v0.2 · Solo build. Rule: **P0 100% shesh na hole P1 shuru na.**
> Prottek feature shesh e **commit + push** (Vercel auto-deploy). Repo **public**, created on/after 21 Nov. No force-push, no squash.

---

## Event facts (rulebook)

| Item | Detail |
|---|---|
| Pre-build | 21–23 Nov (code allowed only from 21 Nov) |
| **Payment** | Tk 1,350, bKash/Nagad to the number in the selection email, **by 23 Nov 11:59 PM**; submit sender number + TrxID; wait for confirmation email |
| Final | **24 Nov, Comilla University**, 5 continuous hours; >30 min late may be refused |
| Bring | Laptop, charger, extension cord, backup mobile data, **original student ID** |
| Final submission | Title + description (≤150 words), public repo, live link, AI disclosure, demo video (optional, ≤3 min); **submit 10 min early** |
| Domain | FinTech (primary), Business and Industry (secondary) |
| Still unconfirmed | Final-day schedule, room, prize categories (watch email + spam) |

## Timeline overview

| Day | Phase | Exit check |
|---|---|---|
| 21 Nov (Sat) | 0 + 1 + 2 | Live URL, DB + seed, extraction accuracy % printed |
| 22 Nov (Sun) | 3 | Demo sentence works end-to-end on the live URL |
| 23 Nov (Mon) | 4 + 5 | Forecast, restock, insight; README; video; **freeze 6 PM**; travel |
| 24 Nov (Tue) | 6 | On-site: judges' cases, demo, submit |

---

## Phase 0 — Setup (21 Nov, ~1.5 h) · P0
- [ ] Public GitHub repo `amar-dokan` (created today), git author = Neo-alif
- [ ] `create-next-app` (TS, Tailwind, App Router, `src/`)
- [ ] `npm i @supabase/supabase-js zod @google/genai groq-sdk` (Recharts later)
- [ ] Folder structure (TRD §3), `docs/` with these 6 files
- [ ] `.env.example` + `.env.local` (gitignored); README skeleton
- [ ] i18n `dictionary.ts` + `LanguageContext` (default `bn`); fonts Hind Siliguri + Inter
- [ ] Supabase project; Gemini key; Groq key
- [ ] Vercel import → blank page live
- **Done when:** live URL shows "আমার দোকান"; first commit pushed

## Phase 1 — Database + seed (21 Nov, ~2 h) · P0
- [ ] Run `001_init.sql` (Schema v0.2: RLS, locked RPC, validation, Dhaka TZ, idempotency)
- [ ] Quick SQL test: sale+due, duplicate key, due without customer, overpayment, anon access denied
- [ ] `data/products.json`: ~25 grocery products with aliases, cost, sell price, reorder level
- [ ] `data/seed.ts`: 60 days synthetic sales (weekday pattern), 8–10 customers with dues, some purchases/expenses; make 2–3 products run low on purpose (for the demo)
- **Done when:** Supabase dashboard shows realistic data; `today_summary` returns numbers

## Phase 2 — AI extraction (21 Nov night, ~3 h) · P0 ⭐
- [ ] `lib/schema.ts` (Zod), `lib/logic/normalize.ts`
- [ ] `lib/ai/provider.ts`: Gemini structured output → Groq fallback, timeout, retry
- [ ] `lib/ai/prompts.ts` with 8–10 few-shot examples
- [ ] `lib/logic/matchProduct.ts`
- [ ] `/api/extract` (+ `ai_logs`)
- [ ] `tests/banglish-cases.json` (30 now, 50+ by 22 Nov) + throttled `npm run test:extract`
- **Done when:** accuracy % printed; failures reviewed and the prompt improved once

## Phase 3 — Entry flow + dashboard (22 Nov, ~7 h) · P0 ⭐
- [ ] Text entry + 3 sample-sentence chips
- [ ] `ConfirmCard` (view / edit / cancel, "নতুন পণ্য/কাস্টমার" badges, idempotency key, button disabled while saving)
- [ ] `/api/transactions` (Zod again → new items → `apply_transaction` → Bangla error map)
- [ ] Dashboard: stat cards, low-stock strip, recent transactions
- [ ] `/dues`: list, customer ledger, জমা নিন
- [ ] `MicButton` voice (P1, but do it today if core is done by 6 PM)
- [ ] Ask a friend for ~15 test sentences; reach 50+ cases
- **Done when:** "Rahim vai ke 2 ta soyabin tel dilam, 680 taka, 100 taka baki" → confirm → sales, stock and Rahim's due all update on the **live URL** ✅

## Phase 4 — Intelligence (23 Nov morning, ~4 h) · P1
- [ ] `forecast.ts` (14-day avg × weekday factor, cold start) + `/stock` with "X দিন চলবে"
- [ ] MAPE vs naive baseline script → write the numbers in README
- [ ] `restock.ts` + `/restock` (budget input → ranked list + reasons + budget bar)
- [ ] `summary.ts` + `insight.ts` (number check) → dashboard InsightCard
- [ ] Clarification bubble for missing price/amount
- [ ] `npm run test:logic`

## Phase 5 — Polish, docs, freeze (23 Nov afternoon, ~3 h)
- [ ] Empty / error states (AppFlow §10)
- [ ] Mobile + laptop check
- [ ] English toggle (P2, only if time)
- [ ] **README complete** (TRD §10 checklist)
- [ ] Record demo video (≤3 min, real project) → link in README
- [ ] Fresh clone on the laptop → `npm install && npm run dev` works
- [ ] Rehearse the demo 3×
- [ ] `git tag v1.0-prebuild` + push tag · **feature freeze 6 PM**
- [ ] Payment confirmed? (deadline 11:59 PM tonight)
- [ ] Travel to Comilla (tonight or very early 24 Nov)

## Phase 6 — On-site final (24 Nov, 5 h)

| Time | Task |
|---|---|
| 0:00–0:20 | `.env`, live URL, mic, Gemini + Groq quota check, `git checkout -b judge` |
| 0:20–3:00 | Judges' test cases / modifications: add each failing sentence to the test set, fix, rerun, **commit at least hourly** |
| 3:00–3:45 | Bug fixes, final accuracy number, merge to `main`, deploy |
| 3:45–4:30 | Rehearse demo twice (incl. "AI down" path: manual card fill) |
| 4:30–4:50 | **Submit** (title, ≤150-word description, repo, live link, AI disclosure, video) |
| 4:50–5:00 | Buffer |

**If something breaks:** `git revert <commit>` and push (never force-push). The `v1.0-prebuild` tag shows what last worked.

---

## Demo script (2:30)
1. **Problem (0:20):** khata photo, "we make this notebook understandable to AI"
2. **⭐ One sentence, three updates (0:45):** speak the Rahim sentence → confirm → sales ↑, oil "২ দিন চলবে" in red, Rahim's due +100
3. **Trust (0:20):** "Karim ke 3 ta sabun dilam" → AI asks "কত টাকায় দিলেন?" → answer → confirm. "AI never guesses money; nothing saves without you; the DB re-checks every number"
4. **Restock (0:30):** tap low-stock → budget 5000 → ranked list with reasons
5. **Insight (0:20):** Bangla summary from verified numbers
6. **Proof + impact (0:15):** accuracy X% on 50+ Banglish sentences; forecast Y% better than naive; future: credit profiles

All AI output in the demo is live. If Gemini is rate-limited, Groq answers (live too).

## Cut list (in this order if time runs out)
1. English toggle
2. Product chart
3. Voice (text + chips still demo the AI)
4. Clarification (edit on the confirm card instead)
5. Insight number check → template-only summary (no AI claim for it)

Already cut: auth, PWA, return type, separate /insight page, dark mode.

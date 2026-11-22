# Plan — Amar Dokan

> v0.4 · Solo build. Rule: **P0 100% shesh na hole P1 shuru na.**
> Prottek feature shesh e **commit + push** (Vercel auto-deploy). Repo **public**, created on/after 21 Nov. No force-push, no squash.
> v0.4 (organizer update, 21 Nov): prototype must be **fully working and run locally before 24 Nov**, covering every feature in the idea document. Voice, forecast + low-stock, budget restock and AI insight/report are now **P0**. English toggle, Products / Expenses / Transactions pages and charts are **optional**. Demo runs **locally** (`npm run build && npm start`); Vercel is the backup.

---

## Event facts (rulebook)

| Item | Detail |
|---|---|
| Pre-build | 21–23 Nov (code allowed only from 21 Nov) |
| **Payment** | Tk 1,350, bKash/Nagad to the number in the selection email, **by 23 Nov 11:59 PM**; submit sender number + TrxID; wait for confirmation email |
| Final | **24 Nov, Comilla University**, 5 continuous hours; >30 min late may be refused |
| Bring | Laptop, charger, extension cord, backup mobile data, **original student ID** |
| **Prototype** | Fully working, **runs locally before 24 Nov**, covers every feature in the idea document |
| Final submission | Title + description (≤150 words), public repo, live link, AI disclosure, demo video (optional, ≤3 min); **submit 10 min early** |
| Domain | FinTech (primary), Business and Industry (secondary) |
| Still unconfirmed | Final-day schedule, room, prize categories (watch email + spam) |

## Timeline overview

| Day | Phase | Exit check |
|---|---|---|
| 21 Nov (Sat) | 0 + 1 + 2 | Live URL (backup), DB + seed, extraction accuracy % printed |
| 22 Nov (Sun) | 3 | Demo sentence (typed **and** spoken) works end-to-end locally (`npm run build && npm start`) |
| 23 Nov (Mon) | 4 + 5 | Forecast + low-stock, restock, insight/report all working locally; README; video; **freeze 6 PM**; travel |
| 24 Nov (Tue) | 6 | On-site: judges' cases, demo, submit |

---

## Phase 0 — Setup (21 Nov, ~1.5 h) · P0
- [x] Public GitHub repo `amar-dokan` (created today), git author = Neo-alif
- [x] `create-next-app` (TS, Tailwind, App Router, `src/`)
- [x] `npm i @supabase/supabase-js zod @google/genai groq-sdk` (Recharts later)
- [x] Folder structure (TRD §3), `docs/` with these 6 files
- [x] `.env.example` + `.env.local` (gitignored); README skeleton
- [x] i18n `dictionary.ts` + `LanguageContext` (default `bn`); fonts Hind Siliguri + Inter
- [x] Supabase project (Singapore); Gemini key; Groq key: all verified live; models picked by live test (`gemini-3.1-flash-lite`, `qwen/qwen3.8-27b`)
- [x] Vercel import → blank page live (`vercel.json` region `sin1` = Supabase Singapore)
- **Done when:** live URL shows "আমার দোকান"; first commit pushed

## Phase 1 — Database + seed (21 Nov, ~2 h) · P0
- [x] Run `001_init.sql` + `002_tighten_service_role.sql` (Schema v0.3: RLS, locked RPC, validation, Dhaka TZ, idempotency, least privilege)
- [x] SQL tests (`supabase/tests/001_init_test.sql`, 10 checks): sale+due, duplicate key, due without customer, overpayment ×2, anon/authenticated denied ×3, trigram, least privilege — all PASS
- [x] `data/products.json`: 25 grocery products with aliases, cost, sell price, reorder level (~3 days of demand)
- [x] `data/seed.ts` (`npm run seed`): 60 days synthetic sales (weekday pattern), 9 customers with dues, purchases/expenses; soybean oil, sugar, lentils end low on purpose; self-check vs DB
- [ ] **Re-run `npm run seed` on the morning of 24 Nov** so "today" and the last 60 days line up with the demo day
- **Done when:** Supabase dashboard shows realistic data; `today_summary` returns numbers

## Phase 2 — AI extraction (21 Nov night, ~3 h) · P0 ⭐
- [x] `lib/schema.ts` (Zod, said-values only + `z.toJSONSchema`), `lib/logic/normalize.ts`, `lib/logic/amounts.ts`
- [x] `lib/ai/provider.ts`: Gemini structured output → Groq fallback, timeout, retry
- [x] `lib/ai/prompts.ts` with 8 few-shot examples (improved once: kore/bhara)
- [x] `lib/logic/matchProduct.ts`
- [x] `/api/extract` (+ `ai_logs`)
- [x] `tests/banglish-cases.json` (30) + throttled `npm run test:extract` → Gemini 29/30 run (Gemini itself 27/27); Groq-only hard cases 3/5, Groq free tier ≈3 calls/min
- [ ] 50+ cases (friend's ~15 sentences still to add)
- **Done when:** accuracy % printed; failures reviewed and the prompt improved once

## Phase 3 — Entry flow + dashboard (22 Nov, ~7 h) · P0 ⭐
- [x] Text entry + 3 sample-sentence chips
- [x] `ConfirmCard` (view / edit / cancel, "নতুন পণ্য/কাস্টমার" badges, idempotency key, button disabled while saving)
- [x] `/api/transactions` (Zod again → new items → `apply_transaction` → Bangla error map)
- [~] Home (done: top bar + pill, hero, stat strip, weekly profit, floating mic; to do: এখন যা করবেন + audit in Phase 4, menu tiles/⋮ menu with the pages) (match `docs/mockup/Main.dc.html` + UIspec §3b): navy top bar with বাং/EN pill (optional), hero + হিসাব দিন, 4-box stat strip (আজকের বিক্রি · আজকের খরচ · মোট বাকি · স্টক কম), weekly profit box, এখন যা করবেন, menu boxes, floating mic
- [ ] `/dues`: list, customer ledger, জমা নিন
- [x] `MicButton` voice (**P0**, Web Speech `bn-BD`, transcript fills the editable text box; text stays an equal option). Real-mic test of 10 sentences: Alif
- [ ] Ask a friend for ~15 test sentences; reach 50+ cases
- **Done when:** "Rahim vai ke 2 ta soyabin tel dilam, 680 taka, 100 taka baki" (typed and spoken) → confirm → sales, stock and Rahim's due all update **locally** with `npm run build && npm start` ✅ (Vercel backup checked too)

## Phase 4 — Intelligence (23 Nov morning, ~4 h) · P0
- [x] `forecast.ts` (SES α = 0.3 × weekday factor, cold start) + `/stock` with "X দিন চলবে" (**P0**); কম = stock ≤ reorder level or < 7 days left (same count on home)
- [~] Low-stock alert: stock status chips done; জরুরি item in এখন যা করবেন with the home card (**P0**)
- [ ] MAPE vs naive baseline script → write the numbers in README
- [ ] `restock.ts` + `/restock` (budget input → ranked list + reasons + budget bar) (**P0**)
- [ ] `summary.ts` + `insight.ts` (number check) → মাসিক অডিট রিপোর্ট box (first line আজকের সারাংশ) + `/report` print page (PDF) (**P0**)
- [ ] Best/worst seller lists on home (P1)
- [ ] Clarification bubble for missing price/amount (P1)
- [ ] `npm run test:logic`
- Optional (only after every P0/P1 works locally): Products page + detail, Expenses page, Transactions page, charts

## Phase 5 — Polish, docs, freeze (23 Nov afternoon, ~3 h)
- [ ] Empty / error states (AppFlow §10)
- [ ] Mobile + laptop check
- [ ] English check (optional): switch the বাং/EN pill, every screen reads correctly (en text is still added with each dictionary key)
- [ ] **README complete** (TRD §10 checklist)
- [ ] Record demo video (≤3 min, real project) → link in README
- [ ] Fresh clone on the demo laptop → `npm install`, copy `.env.local`, `npm run build && npm start` → every feature works locally
- [ ] Vercel backup URL checked (same build)
- [ ] Rehearse the demo 3×
- [ ] `git tag v1.0-prebuild` + push tag · **feature freeze 6 PM**
- [ ] Payment confirmed? (deadline 11:59 PM tonight)
- [ ] Travel to Comilla (tonight or very early 24 Nov)

## Phase 6 — On-site final (24 Nov, 5 h)

| Time | Task |
|---|---|
| 0:00–0:20 | `.env.local`, `npm run build && npm start` locally, mic, Gemini + Groq quota check, Vercel backup URL, `git checkout -b judge` |
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
Only optional / P1 items can be cut. Voice, forecast + low-stock, restock and insight/report are P0 and stay.
1. Charts
2. Products / Expenses / Transactions pages
3. বাং/EN pill (en text stays in the dictionary either way)
4. Best/worst seller lists
5. Clarification (edit on the confirm card instead)

Already cut: auth, PWA, return type, separate /insight page, dark mode.

# PRD — Amar Dokan (আমার দোকান)

> Product Requirements Document · v0.3 · CoU AI Hackathon 2026
> Domain: **FinTech** (primary) · **Business and Industry** (secondary) · Solo team
> Tagline: **Your Business, Understood by AI.**

---

## 1. Ek line e

Chhoto dokandar Bangla/Banglish e **bole ba likhe** dokan chalabe. AI kotha bujhe hishab rakhe, ar bole **ki kinte hobe, kotota, kobe**.

## 2. Problem

- Dokandar ra khata, mathay hishab ar calculator diye dokan chalay. Somoy lage, vul hoy.
- Ke koto baki, kon jinish shesh hoye jacche, kon mal poira ache: kono clear picture nai.
- Existing POS/inventory app e form, English, complicated screen. Onek dokandar use kore na.
- Fole kena-kata guesswork: mal shesh hoye bikri miss, ba oprojonio mal kine taka atke thake.

## 3. Target user

| Persona | Kemon | Ki chay |
|---|---|---|
| **Karim bhai** (primary) | Para er mudi dokan, 45, smartphone chalan, typing e dhir | Bole entry, baki hishab, kon mal kinte hobe |
| **Rina apa** | Pharmacy/stationery, 30, ektu tech-friendly | Daily summary, stock alert |
| **Judge** (hackathon) | 2-3 minute e bujhte chay | Clear demo, real AI, measurable impact |

## 4. Goals

1. Ekta sentence bole ba likhe transaction record kora (form chhara).
2. Shob hishab (bikri, khoroch, baki, stock) ek dashboard e.
3. Stock shesh hobar **age** alert ar 7 diner chahida estimate.
4. Budget dile **kon mal koto kinbe** er list.
5. Protidin Bangla te ekta chhoto business summary.

## 5. Non-goals (ekhon na)

- Payment gateway, bKash integration
- Multi-branch, multi-user staff role
- Supplier ordering, receipt scanning
- Native app / PWA (web only for the hackathon)
- Login / multi-shop accounts (single demo shop, no login)
- Return / refund transactions
- Credit score (future scope, shudhu pitch e)

## 6. Core features

| # | Feature | Priority | Description |
|---|---|---|---|
| F1 | **Bole/likhe entry** | P0 | Mic button (bn-BD) ba text box. Banglish o cholbe |
| F2 | **AI extraction** | P0 | Sentence → structured transaction (type, product, qty, price, customer, paid, due) |
| F3 | **Confirm card** | P0 | AI ja bujhlo dekhay; dokandar confirm/edit kore. Confirm chhara kichu save hoy na |
| F4 | **Auto update** | P0 | Confirm er por stock, bikri, baki update (deterministic backend) |
| F5 | **Dashboard** | P0 | Ajker bikri, khoroch, mot baki, stock list |
| F6 | **Baki khata** | P0 | Customer-wise baki, joma (payment) entry |
| F7 | **Low-stock alert** | P1 | Reorder level er niche gele alert |
| F8 | **7-day forecast** | P1 | Exponential smoothing + weekday adjustment; "koydin cholbe" |
| F9 | **Restock plan** | P1 | Budget input → ranked buy list |
| F10 | **Daily insight** | P1 | Dashboard card; LLM writes Bangla from verified numbers only |
| F11 | **Bangla UI (default)** | P0 | Shob text dictionary diye; **বাং/EN pill in top bar = P1** (en text added with every key) |
| F12 | **Clarification** | P1 | Info missing hole AI proshno kore ("কত টাকায় দিলেন?") |

| F13 | **Home hero + entry button** | P0 | Compact hero, feature points, হিসাব দিন |
| F14 | **Weekly profit box** | P0 | This week vs last week %, deterministic |
| F15 | **এখন যা করবেন** | P0 | Rule-based action list (stock, dues, fast movers) |
| F16 | **Best/worst sellers** | P1 | Two scroll lists on home |
| F17 | **Audit report PDF** | P1 | Print-styled page → browser Save as PDF |
| F18 | **Products page + product detail** | P2 | Full list, per-product forecast |

Voice input (F1 mic part) is **P1**; text input is P0. Forecast/stock list are P1. Chart is P2.

## 7. User stories

- Dokandar hishebe, ami **"Rahim vai ke 2 ta soyabin tel dilam, 680 taka, 100 taka baki"** bolle chai app nije bikri, stock ar baki update kore.
- Ami confirm er age dekhte chai AI ki bujheche, jate vul hole thik korte pari.
- Ami shokale dekhte chai kon mal 2-3 diner moddhe shesh hobe.
- Amar haate 5,000 taka ache, ami jante chai prothome ki kinbo.
- Ami jante chai ke ke koto baki ache.

## 8. Success metrics

| Metric | Target (demo) | Kivabe measure |
|---|---|---|
| Extraction accuracy | ≥ 85% | `tests/banglish-cases.json` (50+ sentence) er upor script |
| Entry time | < 15 sec / transaction | Stopwatch, khata vs app |
| Forecast quality | lower MAPE than naive baseline | Last 7 days hold-out, synthetic data (stated openly) |
| Confirm-edit rate | track kora | `ai_logs` e kotogulo edit hoyeche |

> Target gulo honest rakhbe. Real number je ashe sheta-i pitch e bolbe.

## 9. Constraints

- Build window: 21-23 Nov pre-build + 24 Nov 5 ghonta on-site.
- Final day te judge **test case / modification** dite pare → code modular hote hobe.
- Free tier: Vercel Hobby, Supabase free, LLM free/low-cost tier.
- Venue internet unreliable hote pare → hotspot + recorded backup video.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Bangla voice recognition noisy | Text fallback shob shomoy; demo te quiet jayga |
| LLM vul bujhe | JSON schema validation + confirm card + clarification |
| LLM rate limit / down | Gemini → Groq fallback (both real AI); both down → owner fills the card manually. **No cached/canned AI output (rulebook: disqualification)** |
| Wrong money numbers | DB function recomputes and validates; idempotency key stops duplicates |
| Public repo leaks data | RLS on, RPC locked, keys server-only |
| Judge er modification | Logic alada file e, `docs/` e documented |
| Scope boro | P0 age 100%, tarpor P1 |

## 11. Open questions

- ~~LLM provider~~ → Gemini free tier + Groq fallback (decided)
- ~~Login~~ → no login in v1 (decided)
- Final-day schedule, room, prize categories → organizers (watch email)
- Real shop data (even one week of khata photos) → trying

# AppFlow — Amar Dokan

> v0.5 · User kon screen theke kon screen e jay, ar prottek action e ki hoy.
> v0.5: priorities follow Plan v0.4 (voice, forecast, low-stock, restock, insight/report P0; English pill, Products/Transactions/Expenses pages, charts optional). Profit box weekly, audit report monthly.
> v0.4: approved mockup screens in `docs/mockup/`: Main (home), Entry, Stock, Dues, Restock, Transactions, Products, Expenses, Report.
> v0.3: new home layout (hero + weekly status + product lists), no navbar (logo · search · ⋮), floating mic, products pages, audit PDF.
> v0.2: /insight page cut (insight lives on the dashboard), return type cut, new product/customer path, double-tap guard, AI-down path.

---

## 1. Screen map (v0.3, laptop-first)

```
┌ Top bar (navy): [লোগো আমার দোকান]  [বাং|EN] [🔍 খুঁজুন] [⋮ মেনু] ┐  ← no navbar
│                                                          │
│ SECTION 1  Hero (navy band): tag "আপনার দোকানের এআই হিসাবরক্ষক" │
│            H1 "আমার দোকানে সব হিসাব" + subline + 4 feature tiles │
│            line art (khata, calculator, receipt, coins) at edges │
│            [হিসাব দিন] amber pill (center bottom) → /entry  │
│                                                          │
│ SECTION 2  এই সপ্তাহের অবস্থা                              │
│   [সাপ্তাহিক লাভ ▲%] [এখন যা করবেন] [মাসিক অডিট রিপোর্ট + PDF] │
│   [স্টক] [বাকি খাতা] [কেনাকাটা] [লেনদেন] [পণ্য] [খরচ]      │
│                                                          │
│ SECTION 3  পণ্যের বিক্রি                                    │
│   [বেশি বিক্রি: scroll list] [কম বিক্রি: scroll list]       │
│        "সব দেখুন" → /products   ·   row click → /products/[id] │
└ Floating 🎤 button (every page, bottom-right) → /entry ──┘
```

Routes (P0): `/` (home) · `/entry` · `/stock` · `/dues` · `/restock` · `/report` (monthly audit, printable)
Routes (optional): `/transactions` · `/products` · `/products/[id]` · `/expenses`
⋮ menu: হিসাব দিন, the menu-box links, মাসিক অডিট রিপোর্ট, ভাষা (optional, same switch as the top-bar pill).
**Source of truth for look and copy:** the mockup and UIspec §3b win over any other text in these docs.
Visual mockup: `docs/mockup/` (Main → `/`, Entry → `/entry`, Stock → `/stock`, Dues → `/dues`, Restock → `/restock`, Transactions → `/transactions`, Products → `/products`, Expenses → `/expenses`, Report → `/report`). Numbers in the mockup are sample data only.

## 2. Main flow: Bole entry (core demo)

```
[Mic tap] → listening… → text ashe → [পাঠান]
     │
     ▼
 POST /api/extract  (LLM)
     │
     ├─ valid JSON + shob field ache ──► Confirm Card
     │
     ├─ field missing ──► Clarification proshno
     │                     ("কত টাকায় দিলেন?")
     │                     user uttor → abar extract
     │
     ├─ bujhte pare ni ──► "বুঝতে পারিনি, আবার বলুন"
     │                     + text e likhar option
     │
     └─ Gemini + Groq dutoi fail ──► "এখন বুঝতে পারছি না"
                           + khali Confirm Card, owner nije fill kore
                           (kono canned AI answer na)
```

### Confirm Card
```
┌────────────────────────────────┐
│ 🟢 বিক্রি                       │
│ কাস্টমার:  রহিম ভাই             │
│ পণ্য:      সয়াবিন তেল × ২       │
│ মোট:       ৬৮০ টাকা             │
│ জমা:       ৫৮০ · বাকি: ১০০       │
│                                │
│ [✓ নিশ্চিত করুন]  [✎ ঠিক করুন]   │
│ [✕ বাতিল]                       │
└────────────────────────────────┘
```

| Action | Ki hoy |
|---|---|
| ✓ নিশ্চিত | Button disable → `POST /api/transactions` (with idempotency key) → DB re-checks all numbers → toast "সেভ হয়েছে" → dashboard update |
| ✎ ঠিক করুন | Card er field editable hoy → save |
| ✕ বাতিল | Kichu save hoy na, `ai_logs` e "rejected" |

**Rules:**
- Confirm chhara DB te kono transaction likha hobe na.
- Card khulle ekta `idempotency_key` toiri hoy; double-tap ba retry te o ekta-i transaction.
- "নতুন পণ্য" / "নতুন কাস্টমার" badge thakle confirm er shathe shei row o toiri hoy (price editable).
- Baki ache kintu customer naam nai → card e lal line: "বাকি রাখতে কাস্টমারের নাম লাগবে", confirm disabled.

---

## 3. Transaction types (AI ja chinbe)

| Type | Example sentence | Ki update hoy |
|---|---|---|
| `sale` | "2 kg chal 140 taka" | stock ↓, bikri ↑ |
| `sale` + due | "Rahim ke 1 ta sabun, baki" | stock ↓, bikri ↑, Rahim baki ↑ |
| `purchase` | "aj 10 kg dal kinlam 1200 taka" | stock ↑, khoroch ↑ |
| `expense` | "current bill 800 dilam" | khoroch ↑ |
| `payment` | "Rahim vai 300 taka dilo" | Rahim baki ↓, cash ↑ |

Ek sentence e onek item thakte pare: "2 ta sabun ar 1 kg chini" → ekta transaction, duita item.

---

## 4. Home (/)

**Section 1: Hero (navy band, copy exactly as `docs/mockup/Main.dc.html`)**
- Tag (above title) "আপনার দোকানের এআই হিসাবরক্ষক"
- Title "**আমার দোকানে** সব হিসাব", subline "বিক্রি, বাকি, স্টক, সব এক জায়গায়। শুধু বলুন বা লিখুন।"
- 4 feature tiles: বলে বা লিখে হিসাব · কাস্টমারের বাকির হিসাব · স্টক শেষ হওয়ার আগেই সতর্কতা · বাজেট বুঝে কেনাকাটার পরামর্শ
- Big button **হিসাব দিন** → `/entry`; no example sentence

**Section 2: এই সপ্তাহের অবস্থা**
| Box | Content | Source |
|---|---|---|
| সাপ্তাহিক লাভ | This week's gross profit, ▲/▼ % vs last week, 7 small daily bars | `summary.ts` (deterministic) |
| এখন যা করবেন | 2–4 ranked actions: জরুরি (stock ≤ 2 days) · খেয়াল (due > 7 days) · পরামর্শ (fast movers) | rules in `summary.ts`, not AI |
| মাসিক অডিট রিপোর্ট | **This calendar month** (Asia/Dhaka) vs last month: 5 Bangla AI bullet points from verified numbers + **PDF ডাউনলোড** + পুরো রিপোর্ট (`/report`) | numbers: `summary.ts`; words: `insight.ts` (+ number check) |
- Week = Saturday–Friday, Asia/Dhaka (BD shop week).
- Profit = Σ sale items (unit_price − product cost_price) × qty. Uses **current** cost price (MVP limitation; say so if asked).
- Profit box = **weekly**; audit box = **monthly** (as in the mockup).
- Menu boxes (icons): স্টক · বাকি খাতা · কেনাকাটা (P0) · লেনদেন · পণ্য · খরচ (optional pages)

**Section 3: পণ্যের বিক্রি**
- Two scroll boxes (fixed height, ~6 rows visible): বেশি বিক্রি (top 10 by qty this week), কম বিক্রি (bottom 10, products with stock > 0)
- "সব দেখুন" → `/products` (full sortable list); row → `/products/[id]` (stock, days left, 7-day forecast, this week's sales)

**Monthly audit report (`/report`, P0):** month totals (মোট বিক্রি, লাভ, খরচ, মোট বাকি), মূল কথা (5 AI bullets, number-checked), সেরা ৫ পণ্য, as in `docs/mockup/Report.dc.html`. It is a print-styled page; the button calls `window.print()` → browser "Save as PDF". No PDF library.

## 5. Stock (/stock)
- Product list: naam, stock, unit, "koydin cholbe", status chip (ঠিক আছে / কম / শেষ)
- Product e click → 7-day forecast (chart = optional)
- < 14 din data → "শিখছি" (forecast nai, reorder level diye alert)

## 6. Baki (/dues)
- Customer list, baki amount boro theke chhoto
- Customer e click → ledger (kobe ki nilo, kobe koto dilo)
- "জমা নিন" button → payment entry (bole o kora jay)

## 7. Restock (/restock)
```
বাজেট: [ ৫০০০ ] টাকা  [হিসাব করুন]
───────────────────────────────
১. সয়াবিন তেল  ×১০  ৳১,৭০০  (২ দিনে শেষ হবে)
২. চিনি        ×১০ kg ৳১,৩০০  (৩ দিনে শেষ)
৩. ডাল         ×৮ kg  ৳১,০৮০
মোট: ৳৪,০৮০ · বাকি বাজেট: ৳৯২০
```
Prottek line e "keno" (risk + profit) chhoto kore.

## 8. Insight (dashboard card)
- Dashboard e 2-3 line Bangla summary (LLM, shudhu verified number theke)
- LLM er text e kono number summary te na thakle → template sentence dekhay
- "Shobcheye beshi bikri", "baki barche", "kal ki kinben"

## 9. Language toggle (optional)
- Default `bn`. **বাং/EN pill in the top bar** (and ভাষা in the ⋮ menu); toggle korle shob UI text English.
- Rule: every new key in `src/i18n/dictionary.ts` gets its `en` text in the same change (the `Dict` type enforces it), so there is no separate translation phase.
- Choice `localStorage` e mone rakhe (try/catch diye).
- AI reply o current language e ashe (prompt e `lang` pathano hoy).

## 10. Error / empty states

| Obostha | Dekhabe |
|---|---|
| Mic permission nai | "মাইক চালু করুন, অথবা লিখে দিন" |
| Internet nai | "ইন্টারনেট নেই" + entry draft local e thake |
| LLM error | "এখন বুঝতে পারছি না, আবার চেষ্টা করুন" |
| Notun product | Confirm card e "নতুন পণ্য যোগ হবে" badge |
| Stock negative hobe | Warning: "স্টকে আছে মাত্র ১টা" (save block na, warn) |

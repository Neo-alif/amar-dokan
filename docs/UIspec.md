# UIspec — Amar Dokan

> v0.4 · Dekhte kemon hobe: color, font, component, layout.
> v0.4: final approved mockup in `docs/mockup/*.dc.html` (open in a browser or read as HTML). **Build to match these files.**
> v0.3: laptop-first, top bar instead of nav, hero, status boxes, product lists. Visual reference: Design canvas "Amar Dokan UI Mockup".
> v0.2: sample-sentence chips, manual-fill state, badges; LanguageToggle = P2; chart = P2.
> Design principle: **boro, shohoj, Bangla-first.** Karim bhai jeno chosma chhara o pore.

---

## 1. Design principles

1. **Ek screen, ek kaj.** Ek page e beshi jinis na.
2. **Mic button shobcheye boro.** App er main kaj bola.
3. **Number boro, label chhoto.** Taka shobar age chokhe pore.
4. **Color mane kichu.** Shobuj = thik/ay, lal = shesh/baki, holud = shotorko.
5. **Touch target ≥ 48px.** Mota angul e o chap pore.

## 2. Color

| Token | Hex | Use |
|---|---|---|
| `--primary` | `#1F3A5F` | Header, primary button (navy) |
| `--accent` | `#6D28D9` | Mic button, highlight (purple, doc er sathe mil) |
| `--success` | `#16A34A` | Bikri, joma, "ঠিক আছে" |
| `--warning` | `#D97706` | Stock kom, clarification |
| `--danger` | `#DC2626` | Baki, stock shesh, error |
| `--bg` | `#F8FAFC` | Page background |
| `--surface` | `#FFFFFF` | Card |
| `--text` | `#0F172A` | Main text |
| `--muted` | `#64748B` | Label, secondary |
| `--border` | `#E2E8F0` | Card border |

Dark mode: CUT.

## 3. Typography

| Use | Font | Size / weight |
|---|---|---|
| Bangla text | **Hind Siliguri** (Google Fonts) | 16px body, 600 heading |
| English text | **Inter** | same scale |
| Number (taka, qty) | Inter tabular-nums | 28-36px bold on stat cards |

Next.js e `next/font/google` diye load. Bangla line-height 1.6 (juktakkhor er jonno).

**Number format:** Bangla mode e Bangla digit (৳ ৪,২৫০), English e `৳ 4,250`. Helper: `formatTaka(n, lang)` using `Intl.NumberFormat('bn-BD')`.

## 3b. Final look (approved 21 Nov)

| Element | Spec |
|---|---|
| Top bar | Navy `#1F3A5F`; logo box amber `#FBBF24` with navy shop icon; "আমার" white + "দোকান" amber; বাং/EN pill toggle (active amber); white search; ⋮ opens dropdown (হিসাব দিন, স্টক, বাকি খাতা, কেনাকাটা, লেনদেন, পণ্য, খরচ, মাসিক অডিট রিপোর্ট, ভাষা) |
| Hero | Navy band, flat colorful line-art (amber khata, teal calculator, pink receipt, coins) at the edges; H1 "**আমার দোকানে** সব হিসাব" (first part amber), 60px; amber tag "আপনার দোকানের এআই হিসাবরক্ষক"; amber pill button হিসাব দিন; no example line |
| Section headings | 52px tinted icon box + 32px bold title + 72×5px color bar + subtitle |
| Status cards | 2px colored outline, 6px colored top strip, soft colored shadow, radius 20px: লাভ green, এখন যা করবেন orange, মাসিক অডিট রিপোর্ট purple (5 bullet points + PDF + পুরো রিপোর্ট) |
| Menu tiles | Tinted background + matching 1.5px outline, white icon square |
| Menu pages | Same top bar with back-to-home and page title; each page has its own accent color for all outlines: স্টক blue, বাকি খাতা red, কেনাকাটা green, লেনদেন purple, পণ্য amber-brown, খরচ slate, অডিট teal |

No gradients anywhere (flat colors only).

## 4. Layout (laptop-first)

- **Laptop (≥ 1024px, primary, demo):** content `max-width: 1200px`, centered, 32px side padding. Section 2 = 3 status boxes in a row + 6 menu boxes in a row; Section 3 = 2 lists side by side.
- **Tablet/mobile (< 1024px):** status boxes and lists stack to 1 column, menu boxes 3 per row, hero feature points 2×2.
- **Top bar (no navbar):** logo + "আমার দোকান" left; search field (max ~460px) + ⋮ menu button right. White, 1px bottom border.
- **Floating mic button:** 68px circle, `--accent`, bottom-right 32px, every page except `/entry`.
- Spacing scale 4/8/12/16/24/32px. Card radius 16px, 1px `--border`, no heavy shadows. **No gradients** (unslop rule).

### Home sections
| Section | Spec |
|---|---|
| Hero | White band, faint (8% opacity) khata + calculator line art behind; purple pill tag; H1 52px/700 navy; 4 feature tiles (icon + label); accent pill button 20px/600 with mic icon |
| Status boxes | 3 equal cards: profit (big number 40px, ▲ green / ▼ red pill with %), actions (colored chip জরুরি red · খেয়াল amber · পরামর্শ grey), audit (sparkle icon, AI text, PDF + full report buttons) |
| Menu boxes | 6 tiles: 48px tinted icon square + label |
| Product lists | Card with title + "সব দেখুন →"; inner scroll box 260px; row = rank · name · mini bar · qty |

## 5. Components

### MicButton
- 72px circle, `--accent`, white mic icon
- States: idle · **listening** (pulse animation + "শুনছি…") · processing (spinner) · error (lal border)
- Niche chhoto link: "লিখে দিন" → text input (text is an equal option, not a fallback)

### SampleChips
- 3 tappable example sentences under the input (e.g. "রহিম ভাইকে ২টা সয়াবিন তেল দিলাম, ৬৮০ টাকা, ১০০ টাকা বাকি")
- Tap → fills the text box (user still presses পাঠান, AI runs live)

### TranscriptBox
- Ja shuno hoyeche live dekhay, editable textarea
- Button: [পাঠান]

### ConfirmCard
- Top e type badge: বিক্রি (shobuj) · কেনা (blue) · খরচ (holud) · জমা (purple)
- Field rows: label (muted) + value (bold)
- Multi item hole item table
- 3 button: ✓ নিশ্চিত (primary, full width), ✎ ঠিক করুন, ✕ বাতিল
- "নতুন পণ্য" / "নতুন কাস্টমার" badge jodi DB te na thake (price field editable)
- Validation line (lal): baki without customer, paid > total
- Confirm button disabled while saving (spinner)
- **Manual state:** AI unavailable hole empty card, owner nije fill kore; top e "AI এখন নেই, নিজে লিখুন" 

### ClarifyBubble
- Holud left border, AI er proshno, niche input + mic

### StatCard
- Label (14px muted) + value (32px bold) + optional trend (↑ 12% gotokal theke)

### StockRow
- Naam · stock + unit · "X দিন চলবে" · StatusChip
- StatusChip: ঠিক আছে (shobuj) / কম (holud) / শেষ (lal)

### DueRow
- Customer naam · last date · baki amount (lal) · [জমা নিন]

### RestockItem
- Rank number · product · qty · cost · reason (chhoto muted line)

### StatusCard (profit / actions / audit)
- See §4 Home sections

### ProductRankList
- Fixed-height scroll box, rows link to product detail

### InsightCard
- ✨ icon, 2-4 line Bangla text, niche "শুধু যাচাই করা হিসাব থেকে" chhoto note
- Template fallback hole ✨ icon dekhabe na (AI claim na)

### LanguageToggle (P2)
- Pill switch: `বাংলা | EN`, active ta filled

### Toast
- Bottom, 3 sec: "✓ সেভ হয়েছে", "✕ সমস্যা হয়েছে"

## 6. Copy (Bangla text guideline)

- Shohoj kothar Bangla, shadhu na. "নিশ্চিত করুন", "বাকি", "জমা".
- Error e dosh user er upor na: "বুঝতে পারিনি" (na "ভুল ইনপুট").
- Shob text `src/i18n/dictionary.ts` e, component e hardcode na.

## 7. Accessibility

- Contrast ≥ 4.5:1
- Mic button e `aria-label`
- Keyboard: Enter = পাঠান, Ctrl+Enter = নিশ্চিত
- Voice kaj na korle shob kaj text diye kora jay

## 8. Demo polish (final day)

- Seed data diye dashboard bhora thakbe, khali na
- Confirm er por number animate kore update (count-up)
- Restock list e budget bar (koto use holo)
- Low-stock alert e tap → shorashori /restock (demo flow)

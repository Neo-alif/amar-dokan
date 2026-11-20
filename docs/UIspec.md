# UIspec — Amar Dokan

> v0.2 · Dekhte kemon hobe: color, font, component, layout.
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

## 4. Layout

- **Mobile (< 768px):** single column, bottom nav (5 icon), floating mic button (bottom-center, 72px).
- **Laptop (≥ 1024px):** left sidebar (240px), content max-width 1100px, mic button dashboard e boro card hishebe.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32px. Card radius 16px, shadow subtle.

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

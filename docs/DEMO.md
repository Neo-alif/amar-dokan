# Demo script — 2:30

Run locally: `npm run build && npm start` → http://localhost:3000 in **Chrome** (voice needs Chrome).
All AI in the demo is live (Gemini, Groq as fallback). Nothing is pre-recorded.

## Before the judges arrive (5 min)

1. Morning of 24 Nov: `npm run seed` (so "today" and the 60-day history line up; also adds opening cash/bank/bKash counts).
2. `npm run build && npm start`. Open `/` once so the page is warm.
3. Open these tabs in order: `/` (home), `/entry`, `/stock`, `/restock`, `/dues`, `/report`.
4. Allow the microphone on `localhost` (click the mic once on `/entry`, then stop).
5. Note three numbers on home so you can point at the change: **আজ বিক্রি**, **নগদ**, Rahim's due on `/dues`, and soybean oil stock on `/stock`.
6. Backup tab: https://amar-dokan-iota.vercel.app/ (same build).

## Script

| Time | Page | Say (exact) | Do |
|---|---|---|---|
| 0:00–0:20 | `/` (top of home) | "ঢাকার ছোট দোকানদার আজও খাতা, ক্যালকুলেটর আর মাথার হিসাবে চলে। কে কত বাকি, কোন মাল শেষ হচ্ছে, হাতে কত টাকা আছে — কেউ জানে না। আমার দোকান এই খাতাটাকে AI দিয়ে বোঝায়: দোকানদার শুধু একটা বাক্য বলে।" | Scroll slowly past the hero to **টাকার অবস্থা**. |
| 0:20–1:05 ⭐ | `/entry` | "রহিম ভাইকে দুইটা সয়াবিন তেল দিলাম, ছয়শো আশি টাকা, একশো টাকা বাকি।" (spoken into the mic) Then: "AI শুধু ভাষা বোঝে। দাম, বাকি, স্টক — সব হিসাব করে আমাদের কোড আর ডাটাবেস। আমি নিশ্চিত না করা পর্যন্ত কিছুই সেভ হয় না।" | Tap mic → speak → **পাঠান** → point at the card: মোট ৳680, জমা ৳580, বাকি ৳100, "নিশ্চিত করলে যা বদলাবে" → **নিশ্চিত করুন**. |
| 1:05–1:20 | `/` then `/dues` | "একটা বাক্যে তিনটা জিনিস বদলাল: আজকের বিক্রি বাড়ল, তেলের স্টক কমল, রহিম ভাইয়ের বাকি একশো টাকা বাড়ল — আর নগদে পাঁচশো আশি টাকা ঢুকল।" | Home: আজ বিক্রি +৳680, নগদ +৳580. `/dues`: Rahim +৳100. |
| 1:20–1:40 | `/entry` | Type: **করিমকে ৩টা সাবান দিলাম** → AI asks "কত টাকায় দিলেন?" → answer **৩৫ টাকা করে**. Say: "দাম বলা হয়নি, তাই AI নিজে আন্দাজ করে না — জিজ্ঞেস করে। টাকার ব্যাপারে AI কখনো অনুমান করে না।" | Sample chip → পাঠান → type answer → উত্তর দিন → card ৳105 → **বাতিল** (don't save; keeps the story clean). |
| 1:40–2:05 | `/stock` → `/restock` | "সয়াবিন তেল আর মাত্র কয়েক দিন চলবে — এটা আগের ৮ সপ্তাহের বিক্রি থেকে exponential smoothing আর সপ্তাহের দিন ধরে অনুমান।" On restock: "হাতে পাঁচ হাজার টাকা থাকলে কী কিনবেন — যেটা আগে শেষ হবে সেটা আগে, বাজেটের মধ্যে।" | Point at the red "X দিন চলবে". `/restock`: budget **5000** → হিসাব করুন → list with reasons. |
| 2:05–2:20 | `/` (মাসিক অডিট) or `/report` | "মাসের রিপোর্ট বাংলায় AI লেখে, কিন্তু প্রতিটা সংখ্যা আমাদের হিসাব থেকে; AI নতুন কোনো সংখ্যা লিখলে সেটা বাতিল হয়।" | Show the audit card / `/report`. |
| 2:20–2:30 | `/` | "৩০টা বাংলিশ বাক্যে ৯৬.৭% সঠিক। Gemini বন্ধ হলে Groq, দুটোই বন্ধ হলে দোকানদার নিজে লেখে — কখনো বানানো উত্তর না। ধন্যবাদ।" | Stop on home. |

If time is short, cut the 1:40–2:05 restock part to only `/stock` (10 s).

## Backup plan

| Problem | What to do | What to say |
|---|---|---|
| Mic doesn't hear / no Bangla voice | Type the same sentence in the box (or tap a sample chip) | "ভয়েস আর লেখা দুটোই সমান অপশন।" |
| Gemini slow / 503 / quota | Nothing: the app falls back to Groq live | "Gemini ব্যস্ত, তাই Groq উত্তর দিল — দুটোই লাইভ AI।" |
| Both AI providers fail ("এখন বুঝতে পারছি না") | Fill the manual card that opens (it is labelled "এটা AI না") and save | "AI না থাকলেও দোকান চলে; আমরা কখনো নকল AI উত্তর দেখাই না।" This is a rule of the hackathon — show it proudly. |
| Card is wrong (wrong item/price) | **ঠিক করুন** → fix → নিশ্চিত করুন | "এজন্যই কনফার্ম কার্ড — মালিকের কথাই শেষ কথা।" |
| `npm start` / laptop problem | Open the Vercel backup tab | — |
| No internet at the venue | Phone hotspot (backup data). The DB and AI are online services; there is no offline mode. | — |
| Numbers look odd (old demo data) | `npm run seed` (≈1 min), reload | — |
| Rahim sentence already saved twice | Use another customer: "সালমা আপাকে ২ কেজি আলু দিলাম, ৭৬ টাকা, ৫০ টাকা দিল" | — |

## Optional extra (only if a judge asks about money)

- Home → **টাকার অবস্থা** → নগদ **মিলিয়ে নিন** → type the counted cash → show পার্থক্য live → সেভ করুন.
- Say: "বিকাশ বা ব্যাংকে টাকা এলে লেনদেনের সাথে বলে দিলেই সেই হিসাবে যায়; কার্ডে বদলানো যায়।"

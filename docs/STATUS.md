# Status — 23 Nov 2026 work list

One commit + push per item. "You" = Alif.

| # | Item | State | Commit | What you must do |
|---|---|---|---|---|
| 1 | README complete (TRD §10) | done | `docs(readme)` | Record the demo video and put its link in README |
| 2 | Logo: top bar, favicon, README | done | `feat(brand)` | — |
| 3 | Clarification: ClarifyBubble → answer (text/mic) → re-extract → card | done | `feat(entry): ask` | — (tested live: "করিমকে ৩টা সাবান দিলাম" → "কত টাকায় দিলেন?" → "35 taka kore" → card ৳105) |
| 4 | Money position (টাকার অবস্থা): নগদ/ব্যাংক/বিকাশ via মিলিয়ে নিন with history, payment method (AI + card), পাওনা, দেনা, মোট; migration 003 (also suppliers for item 7) | done | `feat(money)` | Done: 003 applied, 003 SQL tests 14/14 PASS. Note: `001_init_test.sql` check #7 now expects 8 tables but there are 11 (not a bug). One test count "test: khuchra diyechi" is in the demo shop; the re-seed on 24 Nov clears it and adds opening counts. |
| 5a | docs/DEMO.md: 2:30 script, exact sentences, page order, backup plan | done | `docs(demo)` | Rehearse it 3×; note the 4 numbers before starting. JUDGE_QA.md still to do. |

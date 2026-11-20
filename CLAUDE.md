# CLAUDE.md — Amar Dokan (আমার দোকান)

Bangla-first AI business assistant for small retailers in Bangladesh. Built solo by Alif (GitHub: Neo-alif) for CoU AI Hackathon 2026.
Pre-build 21–23 Nov 2026 · On-site final 24 Nov 2026 (5 hours, Comilla University).

## Source of truth
Read before any work: `docs/PRD.md`, `docs/AppFlow.md`, `docs/UIspec.md`, `docs/TRD.md`, `docs/Schema.md`, `docs/Plan.md` (all v0.2), plus `README.md` once it exists.
- Follow the latest docs. Never silently invent requirements.
- If docs conflict: name the conflict, explain it, recommend the safest option, and **ask** before changing scope or architecture.
- Current phase and checklist: `docs/Plan.md`.

## Mandatory hackathon rules (breaking these can disqualify us)
- **No hard-coded, cached, pre-recorded or faked AI output.** Every extraction/insight is live inference. Gemini primary, Groq live fallback. If both fail, the UI says AI is unavailable and the owner fills the card by hand (clearly labelled, not AI).
- Public GitHub repo; code only from 21 Nov 2026.
- Regular, meaningful commits; at least hourly on 24 Nov.
- **No force-push, no history rewriting, no squashing, no back-dating.** Roll back with `git revert`.
- Never commit secrets (`.env.local`) or real customer data. Keep `.env.example` updated.
- Disclose all AI tools/models and third-party code in `README.md`.

## Git
- Author: `Neo-alif <280590460+Neo-alif@users.noreply.github.com>`.
- **Do not add `Co-Authored-By` or any Claude/session trailer lines to commit messages.** (AI use is disclosed in README instead.)
- Never run destructive git commands (`reset --hard`, `push --force`, `rebase`, branch deletion) or destructive DB operations (drop/truncate/delete) without explicit approval.

## Engineering rules
- LLM understands language; **backend/DB does all money and stock math**. Never trust LLM totals.
- Nothing is saved before the owner confirms. Idempotency key on every save.
- Browser never talks to Supabase directly; all DB access via server API routes with the service-role key. RLS on, RPC locked (Schema §3–4).
- Validate every external input with Zod on the server (including the confirmed payload).
- Keep `lib/ai/` (provider/prompts) separate from `lib/logic/` (pure, deterministic functions) and from UI.
- All UI text through `src/i18n/dictionary.ts` (Bangla default).
- Dhaka timezone (`Asia/Dhaka`) for any "today"/daily logic.
- No new libraries without explaining why. No unused code, no fake functionality. Handle loading, error and empty states.

## How we work (learning mode) — every phase
Alif knows HTML/CSS, JS basics, C/C++, basic Git; he is learning full-stack, APIs, databases and AI integration. Explain in simple Bangla/Banglish with English technical terms and Amar Dokan examples. Teach a concept when we use it, not all at once.

1. **Understand:** what we build, why, where it fits, files touched, dependencies, risks.
2. **Plan:** small steps; give only the immediate next step and its purpose.
3. **Implement:** only the approved step. Explain important actions before doing them. Don't rewrite working files or delete/overwrite important files without permission.
4. **Explain the code:** files created/modified, key functions, data flow, concepts used, why this approach over alternatives.
5. **Test:** what/how/commands/expected output/common errors. Run tests where possible. **Never claim a test passed unless it actually ran.** Fix failures before moving on.
6. **Change report:** Implementation Report · Learning Report · Judge Preparation (3 likely questions + answers, 1 hard follow-up + what to understand) · Git Report (commit message, why, deploy impact).
7. **Wait:** after each milestone, STOP. Say what's done and what's next. Do not start the next milestone without Alif's confirmation.

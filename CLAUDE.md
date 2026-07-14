# Gateway City Church — Claude Code context

## Read first
Before working, read **`docs/REFERENCE.md`** — the source of truth for this project. This file is just the quick orientation.

## What this is
Church visitor CRM for Pastor Danny Hand, Gateway City Church, Las Vegas. Visitors fill out a connection card on their phone, staff manage follow-up from an admin portal. Built by IBS (Miguel Loza).

## Stack
Next.js 16 App Router + TypeScript + Tailwind, Supabase, Resend, Telnyx, Anthropic SDK, ElevenLabs, Vercel. Full detail in `docs/REFERENCE.md`.

## Conventions & rules
- Secrets live in env vars / `.env.local` only, never in code. `.env.local` is gitignored. Rotate immediately if exposed.
- Commit + push at the end of each session to back up. Commit messages end with the Co-Authored-By line.
- NEVER push to GitHub unless user explicitly says to push.
- `SUPABASE_SERVICE_ROLE_KEY` is server-side only — never use in client components.
- All AI output strips em dashes — enforced in `callClaude()` and all prompts.

## Environment variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY       # server-side only, never expose to client
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_FROM_NAME
TELNYX_API_KEY
TELNYX_PHONE_NUMBER
ANTHROPIC_API_KEY
XAI_API_KEY                     # Grok realtime voice for Grace (TTS + STT + realtime)
CRON_SECRET
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_CHURCH_ID
```

## Grace — AI Assistant
- Lives in the admin header (gold pill button, cross icon); chat window drops top-right
- Text brain unchanged: `/api/visitors/nlsearch` → `naturalLanguageSearch()` in `lib/claude.ts` (visitor data + full Bible knowledge, 1-2 sentence replies, CSV export from results)
- **Voice rebuilt on the assistant-starter architecture (2026-07): xAI Grok realtime speech-to-speech** (orb view over the chat), replacing the old ElevenLabs TTS + Web Speech input. This retired the Safari autoplay bug entirely.
- Voice keeps Grace's full data brain via a `search_visitors` **function tool**: Grok calls it mid-call, the client hits the same `nlsearch` route, Grok speaks the answer and the matching visitor cards render behind the orb. Bible questions Grok answers directly.
- Text and voice share one message history (start typing, switch to voice mid-thread, and back).
- Files: `lib/grace-voice-prompt.ts` (voice system prompt), `app/api/grace/realtime-token/route.ts` (mints xAI token server-side), `app/admin/[churchId]/useGraceVoice.ts` (realtime engine hook), orb CSS in `app/globals.css`.
- No crisis/DV safety net (Grace serves pastoral staff, not vulnerable visitors — deliberately omitted).

## Current priority
Grace voice was just rebuilt on Grok realtime. Needs: (1) `XAI_API_KEY` in `.env.local` + Vercel, (2) live on-device test of voice + `search_visitors` function calling, (3) pick the xAI voice (`GRACE_VOICE` in `realtime-token.js`, default "Carina"), (4) rate-limit `nlsearch` + `realtime-token` before heavy use (voice ~$3/hr). See `docs/REFERENCE.md`.

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
ELEVENLABS_API_KEY
CRON_SECRET
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_CHURCH_ID
```

## Grace — AI Assistant
- Lives in the admin header (gold pill button, cross icon)
- Chat window drops top-right; shifts left on Messages tab
- Has full access to all visitor data: emails, SMS, calls, attendance, notes
- Has full Bible knowledge (all 66 books, OT + NT)
- Responses kept to 1-2 sentences
- Voice output: ElevenLabs TTS (custom Grace voice)
- Voice input: Web Speech API — works in Chrome and Safari, NOT Brave
- Conversation mode: mic stays live, Grace speaks response, mic restarts automatically
- CSV download from Grace search results

## Current priority
Fix Grace voice playback reliability in Safari — using DOM `<audio ref playsInline>` + blob URL approach, still debugging autoplay policy. See `docs/REFERENCE.md` for full open-issues tracking as scope grows.

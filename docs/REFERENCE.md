# Gateway City Church — Reference

> Source-of-truth reference for Gateway City Church. Keep it current; `CLAUDE.md` points every new session here.

## 1. Overview
Church visitor CRM for Pastor Danny Hand, Gateway City Church, Las Vegas. Visitors fill out a connection card on their phone; staff manage follow-up (email, SMS, notes) from an admin portal. Built by IBS (Miguel Loza).

## 2. Stack & accounts
- Next.js 16 App Router, TypeScript, Tailwind CSS
- Supabase (project ID: `kdgbivcufoarmvckworj`) — Postgres + Realtime + RLS
- Resend — transactional email (from: demo@innovativeblockchainsolutions.live)
- Telnyx — SMS. **`TELNYX_PHONE_NUMBER` +17754479016 is DELETED from the account (verified 2026-07-22) — inbound SMS + crisis alerts are DORMANT until a Gateway number is provisioned, given a messaging profile, and its webhook pointed at `/api/telnyx/inbound`.**
- Anthropic SDK — `claude-sonnet-5` for AI text via `callClaude` (thinking disabled to protect small max_tokens budgets). `naturalLanguageSearch` (nlsearch) stays on `claude-haiku-4-5` — it's the latency-sensitive text + voice lookup path.
- xAI Grok — Grace's realtime voice (speech-to-speech `grok-voice-latest`, voice **"Ara"**; `GRACE_VOICE` in the realtime-token route). `server_vad` tuned with `threshold: 0.65` + `prefix_padding_ms: 300` to cut background-noise false triggers. Replaced ElevenLabs 2026-07.
- Vercel — hosting
- Repo: GroundworkHQ/gateway-city-church (public; made public to clear the GroundworkHQ private-repo billing-hold push block)
- Live: https://gateway-city-church.vercel.app/admin (admin), /connect (visitor card) — Vercel auto-deploys on push to main
- Local dev: `next dev -p 3002` → http://localhost:3002 (matches `NEXT_PUBLIC_APP_URL`)

## 3. Architecture
- Church ID (multi-tenancy key): `bba69ac7-1cab-4993-84cd-720d4fdf8db4` — routes are scoped as `/admin/[churchId]` and `/visit/[churchId]`
- Brand: dark navy `#0D1B2A`, warm gold `#B8832A`
- Key files:
  - `app/admin/[churchId]/page.tsx` — main admin UI, visitor list, Grace chat, CSV export
  - `app/admin/[churchId]/VisitorDetail.tsx` — visitor detail panel (activity/messages/notes tabs)
  - `app/visit/[churchId]/page.tsx` — visitor connection card (public)
  - `app/admin/page.tsx` — redirects /admin → /admin/[CHURCH_ID]
  - `app/connect/page.tsx` — redirects /connect → /visit/[CHURCH_ID]
  - `lib/claude.ts` — all AI functions: follow-up emails, SMS, insights, Grace search (`naturalLanguageSearch`)
  - `lib/telnyx.ts` — SMS sending
  - `lib/supabase-admin.ts` — server-side Supabase client (service role)
  - `app/api/visitors/nlsearch/route.ts` — Grace natural language search (visitor data + Bible); used by BOTH text chat and the voice `search_visitors` function tool
  - `lib/grace-voice-prompt.ts` — Grace's voice-mode system prompt (single source)
  - `app/api/grace/realtime-token/route.ts` — mints the short-lived xAI realtime token server-side
  - `app/admin/[churchId]/useGraceVoice.ts` — Grok realtime voice engine (mic PCM up, her PCM down, `--orb-level` audio envelope drives the cross glow, `search_visitors` function-calling, shared history, server_vad config)
  - `app/globals.css` — Grace voice cross visual (`.grace-orb` / `.grace-orb-core`, clip-path cross, reactive glow; class/var names kept as "orb")
  - `app/api/telnyx/inbound/route.ts` — inbound SMS webhook → `analyzeUrgency` crisis triage → severity-aware pastor alert
  - `app/api/visitors/route.ts` — visitor creation (normalizes names to title case)

## 4. What's built
- Connection card with split first/last name, QR code (print + download)
- Admin portal: visitor list, search, filter (All/New/Returning/Prayer)
- Visitor detail: inline editing of name/email/phone, activity timeline, email/SMS threads, notes
- Automated email sequence: Welcome (day 0), Follow-up 2 (day 3), Follow-up 3 (day 6)
- SMS via Telnyx with crisis triage — `analyzeUrgency` (`lib/claude.ts`, on Sonnet) returns `{isUrgent, severity, reason}`, severity ∈ emergency|urgent|routine; the Telnyx inbound handler escalates the pastor SMS on emergency. (Dormant while the SMS number is missing — see §2.)
- Geofence exit detection — triggers exit SMS when visitor leaves church
- AI pastoral snapshot per visitor
- Prayer request digest
- CSV export (name, email, phone, service, how heard, prayer, returning, opted out, first visit, last activity, email dates)
- Grace AI assistant (see CLAUDE.md for full behavior spec) — chat in admin header, full visitor data + Bible knowledge access. **Voice on xAI Grok realtime speech-to-speech, keeping the data brain via a `search_visitors` function tool; shared text/voice history.** Voice UI (2026-07-22): a solid glowing gold cross (CSS clip-path in `globals.css`, audio-reactive glow via `--orb-level`), no live captions, and the Grace panel is a fixed `height: 65vh`. The mic/"talk" button is gold `#B8832A`. Retired the old ElevenLabs + Web Speech pipeline and the Safari autoplay bug.

## 5. What's next
- **Provision a Gateway SMS number** (Telnyx): give it a messaging profile, point the inbound webhook at `/api/telnyx/inbound`, set `TELNYX_PHONE_NUMBER` in `.env.local` + Vercel. Until then inbound SMS + crisis alerts are dead (§2).
- Confirm the Vercel prod deploy from the 2026-07-22 push, and that `XAI_API_KEY` is set in Vercel prod (voice needs it live).
- Rate-limit `nlsearch` + `realtime-token` before heavy use (voice ~$3/hr).
- DONE 2026-07-22: `XAI_API_KEY` added; voice = Ara; voice + `search_visitors` verified live locally; Sonnet text brain + Haiku nlsearch split; crisis severity tiers; cross voice UI; VAD threshold. All committed + pushed (`ce817c2`).
- <!-- Add future priorities here as scope grows -->

## 6. Conventions
- Secrets live in `.env.local` only, never in code — see env var list in CLAUDE.md
- `SUPABASE_SERVICE_ROLE_KEY` is server-side only — never use in client components
- Names normalized to title case at API entry (`/api/visitors`)
- All AI output strips em dashes — enforced in `callClaude()` return value and all prompts
- NEVER push to GitHub unless user explicitly says to push
- Commit messages end with the Co-Authored-By line

## 7. Open decisions
<!-- Things still to decide, with the tradeoffs. -->

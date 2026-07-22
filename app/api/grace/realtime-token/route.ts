import { NextResponse } from 'next/server'
import { GRACE_VOICE_PROMPT } from '@/lib/grace-voice-prompt'

// Mints a short-lived xAI realtime ephemeral token so the browser can connect
// directly to the Grok voice agent without ever seeing the real XAI_API_KEY.
// Returns the Grace instructions + voice so the prompt stays server-side as the
// single source of truth (the client passes them into session.update).
//
// Voice name comes from the xAI Voice Library (console.x.ai -> Voice -> Voice
// Library) and is CASE-SENSITIVE (Carina, Ara, Celeste, Eve...). The docs'
// lowercase names are wrong, and an invalid voice returns a misleading
// "Incorrect API key" error.
const GRACE_VOICE = 'Ara'

export async function POST() {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Voice is not configured yet.' }, { status: 500 })
  }

  try {
    const r = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { seconds: 600 } }),
    })

    if (!r.ok) {
      return NextResponse.json({ error: 'Could not start voice session.' }, { status: 502 })
    }

    const data = await r.json()
    return NextResponse.json(
      {
        token: data.value,
        expires_at: data.expires_at,
        voice: GRACE_VOICE,
        instructions: GRACE_VOICE_PROMPT,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ error: 'Voice session error.' }, { status: 502 })
  }
}

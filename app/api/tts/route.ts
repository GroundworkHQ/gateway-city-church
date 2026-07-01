import { NextRequest, NextResponse } from 'next/server'

const VOICE_ID = 'RSUcZp3ilp3WUZWLUwcY' // Grace custom voice

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 })

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  })

  if (!res.ok) return NextResponse.json({ error: 'TTS failed' }, { status: 500 })

  return new NextResponse(res.body, {
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}

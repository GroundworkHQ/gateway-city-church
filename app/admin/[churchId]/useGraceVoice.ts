'use client'

import { useCallback, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Grace realtime voice (xAI Grok voice agent, speech-to-speech).
//
// Streams the staff member's mic up and Grace's voice down over one WebSocket.
// The server handles turn-taking and barge-in natively. Grace reaches her data
// brain through a `search_visitors` FUNCTION TOOL: when she needs visitor data
// she calls it, we POST the query to the existing /api/visitors/nlsearch route,
// hand the answer back, and she speaks it while the matching visitor cards render
// in the chat behind the orb. Bible/theology questions she answers directly.
//
// Ported from the assistant-starter widget, minus the crisis/DV safety net
// (Grace serves pastoral staff, not vulnerable visitors).
// ─────────────────────────────────────────────────────────────────────────────

export type OrbState = 'listening' | 'thinking' | 'speaking' | null
export type GraceTurn = { role: 'user' | 'grace'; content: string }

interface Options {
  churchId: string
  // Prior text/voice turns, so voice continues the thread instead of re-greeting.
  getHistory: () => GraceTurn[]
  // A visitor-data lookup finished: push a Grace message with these cards.
  onSearchResults: (ids: string[], explanation: string) => void
  // A spoken turn completed with no data lookup (greeting, Bible answer, etc.).
  onSpokenTurn: (turn: GraceTurn) => void
}

export function useGraceVoice({ churchId, getHistory, onSearchResults, onSpokenTurn }: Options) {
  const [active, setActive] = useState(false)
  const [orbState, setOrbState] = useState<OrbState>(null)
  const [capUser, setCapUser] = useState('')
  const [capBot, setCapBot] = useState('')

  // `start`/`stop` are memoized, so the long-lived ws.onmessage closure they set
  // up captures first-render function instances. Route every render-varying
  // callback through this ref so those instances always read the latest.
  const optsRef = useRef<Options>({ churchId, getHistory, onSearchResults, onSpokenTurn })
  optsRef.current = { churchId, getHistory, onSearchResults, onSpokenTurn }

  // The orb DOM node — we write --orb-level straight to it (no React re-render).
  const orbRef = useRef<HTMLDivElement | null>(null)
  const setOrbLevel = (v: number) => {
    if (orbRef.current) orbRef.current.style.setProperty('--orb-level', String(Math.max(0, Math.min(1, v))))
  }

  // All mutable audio / socket state lives in refs to avoid stale closures.
  const wsRef = useRef<WebSocket | null>(null)
  const activeRef = useRef(false)
  const micStreamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const procRef = useRef<ScriptProcessorNode | null>(null)
  const micSrcRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const muteRef = useRef<GainNode | null>(null)
  const playHeadRef = useRef(0)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const envRef = useRef<Array<{ t: number; end: number; r: number }>>([])
  const visRafRef = useRef<number | null>(null)
  const speakLvlRef = useRef(0)
  const userLvlRef = useRef(0)
  const greetedRef = useRef(false)
  const voiceRef = useRef<string | null>(null)
  const instructionsRef = useRef<string | null>(null)
  const curUserRef = useRef('')
  const curBotRef = useRef('')
  const didSearchRef = useRef(false)
  const userCommittedRef = useRef(false)

  const send = (o: any) => { const ws = wsRef.current; if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)) }

  const setOrb = (s: OrbState) => setOrbState(s)

  // ── history continuity ──
  const seedHistory = () => {
    const hist = optsRef.current.getHistory()
    if (!hist.length) return false
    let seeded = false
    hist.forEach((m) => {
      if (!m.content) return
      const isA = m.role === 'grace'
      send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: isA ? 'assistant' : 'user',
          content: [{ type: isA ? 'output_text' : 'input_text', text: String(m.content) }],
        },
      })
      seeded = true
    })
    return seeded
  }

  // ── her audio playback + orb envelope ──
  const flushPlayback = () => {
    sourcesRef.current.forEach((s) => { try { s.stop() } catch {} })
    sourcesRef.current = []
    envRef.current = []
    if (ctxRef.current) playHeadRef.current = ctxRef.current.currentTime
  }

  const playChunk = (b64: string) => {
    const ctx = ctxRef.current
    if (!ctx) return
    let bin: string
    try { bin = atob(b64) } catch { return }
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const pcm = new Int16Array(bytes.buffer)
    if (!pcm.length) return
    const f32 = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768
    const buf = ctx.createBuffer(1, f32.length, 24000)
    buf.getChannelData(0).set(f32)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const now = ctx.currentTime
    if (playHeadRef.current < now + 0.02) playHeadRef.current = now + 0.02
    const startAt = playHeadRef.current
    try { src.start(startAt) } catch { return }
    playHeadRef.current += buf.duration
    // ~43ms loudness windows so the orb pulses per syllable. Her side uses gain 9
    // (calmer than the mic's 12) because synth audio has sharper transients.
    const win = 1024
    for (let w = 0; w < f32.length; w += win) {
      const end = Math.min(f32.length, w + win)
      let ss = 0
      for (let k = w; k < end; k++) ss += f32[k] * f32[k]
      const wr = Math.sqrt(ss / Math.max(1, end - w))
      envRef.current.push({ t: startAt + w / 24000, end: startAt + end / 24000, r: Math.min(1, Math.max(0, (wr - 0.006) * 9)) })
    }
    sourcesRef.current.push(src)
    src.onended = () => { const i = sourcesRef.current.indexOf(src); if (i >= 0) sourcesRef.current.splice(i, 1) }
  }

  const visFrame = () => {
    if (!activeRef.current) { visRafRef.current = null; return }
    const now = ctxRef.current ? ctxRef.current.currentTime : 0
    const env = envRef.current
    while (env.length && env[0].end < now) env.shift()
    const hr = env.length && env[0].t <= now ? env[0].r : 0
    speakLvlRef.current = speakLvlRef.current * 0.7 + hr * 0.3
    setOrbLevel(Math.max(speakLvlRef.current, userLvlRef.current))
    visRafRef.current = requestAnimationFrame(visFrame)
  }

  // ── the search_visitors function tool → existing nlsearch route ──
  const runSearch = async (query: string): Promise<{ ids: string[]; explanation: string }> => {
    try {
      const res = await fetch('/api/visitors/nlsearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, churchId: optsRef.current.churchId }),
      })
      const data = await res.json()
      return { ids: Array.isArray(data.ids) ? data.ids : [], explanation: data.explanation ?? 'No results found.' }
    } catch {
      return { ids: [], explanation: 'I could not reach the visitor records just now.' }
    }
  }

  const handleFunctionCall = async (callId: string, args: string) => {
    let query = ''
    try { query = JSON.parse(args)?.query ?? '' } catch {}
    setOrb('thinking')
    const { ids, explanation } = await runSearch(query)
    didSearchRef.current = true
    optsRef.current.onSearchResults(ids, explanation)   // render cards + Grace bubble in the chat
    setCapBot(explanation)
    send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify({ answer: explanation, matched_count: ids.length }) },
    })
    send({ type: 'response.create' })          // let her speak the answer
  }

  const commitUser = () => {
    if (userCommittedRef.current) return
    const t = curUserRef.current.trim()
    if (t) { optsRef.current.onSpokenTurn({ role: 'user', content: t }); userCommittedRef.current = true }
  }

  const onEvent = (e: any) => {
    switch (e.type) {
      case 'session.created':
        send({
          type: 'session.update',
          session: {
            voice: voiceRef.current || 'Carina',
            instructions: instructionsRef.current || '',
            turn_detection: { type: 'server_vad', silence_duration_ms: 500 },
            audio: {
              input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { language_hint: 'en' } },
              output: { format: { type: 'audio/pcm', rate: 24000 } },
            },
            tools: [
              {
                type: 'function',
                name: 'search_visitors',
                description:
                  'Search the church visitor records (visitors, attendance, emails, texts, calls, prayer requests, notes) and get a short spoken-ready answer. Call this for ANY question about specific visitors, groups of visitors, who to follow up with, prayer requests, or attendance. Do not use it for Bible or theology questions.',
                parameters: {
                  type: 'object',
                  properties: { query: { type: 'string', description: "The staff member's question in plain natural language" } },
                  required: ['query'],
                },
              },
            ],
          },
        })
        break
      case 'session.updated':
        if (!greetedRef.current) {
          greetedRef.current = true
          setOrb('speaking')
          const cont = seedHistory()
          send({
            type: 'response.create',
            response: {
              instructions: cont
                ? 'You were just helping this staff member by text and now you are on a voice call. In one short, warm sentence let them know you are here and ready to keep going. Do not re-introduce yourself.'
                : 'Warmly greet the staff member in one short sentence and ask what they need.',
            },
          })
        }
        break
      case 'input_audio_buffer.speech_started':
        flushPlayback(); setOrb('listening')
        curUserRef.current = ''; userCommittedRef.current = false
        break
      case 'input_audio_buffer.speech_stopped':
        setOrb('thinking')
        break
      case 'conversation.item.input_audio_transcription.updated':
        if (e.transcript) { curUserRef.current = e.transcript; setCapUser(e.transcript) }
        break
      case 'conversation.item.input_audio_transcription.completed':
        if (e.transcript) { curUserRef.current = e.transcript; setCapUser(e.transcript) }
        commitUser()
        break
      case 'response.created':
        setOrb('speaking'); curBotRef.current = ''; didSearchRef.current = false; setCapBot('')
        break
      case 'response.function_call_arguments.done':
        if (e.name === 'search_visitors') { commitUser(); handleFunctionCall(e.call_id, e.arguments || '{}') }
        break
      case 'response.output_audio_transcript.delta':
        if (e.delta) { const clean = String(e.delta).replace(/\s*[—–]\s*/g, ', '); curBotRef.current += clean; setCapBot((c) => c + clean) }
        break
      case 'response.output_audio.delta':
        if (e.delta) playChunk(e.delta)
        break
      case 'response.done':
      case 'response.human_assist_turn.commit':
        setOrb('listening')
        commitUser()
        // Search turns already pushed their Grace bubble via onSearchResults.
        if (!didSearchRef.current) {
          const t = curBotRef.current.trim()
          if (t) optsRef.current.onSpokenTurn({ role: 'grace', content: t })
        }
        curBotRef.current = ''
        break
    }
  }

  const stop = useCallback(() => {
    if (!activeRef.current && !wsRef.current) return
    activeRef.current = false
    setActive(false)
    if (visRafRef.current) { cancelAnimationFrame(visRafRef.current); visRafRef.current = null }
    flushPlayback()
    if (procRef.current) { try { procRef.current.disconnect() } catch {} procRef.current.onaudioprocess = null; procRef.current = null }
    if (micSrcRef.current) { try { micSrcRef.current.disconnect() } catch {} micSrcRef.current = null }
    if (muteRef.current) { try { muteRef.current.disconnect() } catch {} muteRef.current = null }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((t) => t.stop()); micStreamRef.current = null }
    if (wsRef.current) { try { wsRef.current.close() } catch {} wsRef.current = null }
    if (ctxRef.current) { try { ctxRef.current.close() } catch {} ctxRef.current = null }
    userLvlRef.current = 0; speakLvlRef.current = 0
    setOrb(null); setOrbLevel(0); setCapUser(''); setCapBot('')
  }, [])

  const start = useCallback(async (): Promise<string | null> => {
    if (activeRef.current) return null
    let micStream: MediaStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch {
      return "I couldn't access your microphone. Allow mic access for this site, then tap the mic again. You can also just type."
    }
    micStreamRef.current = micStream

    let tok: any
    try {
      const tr = await fetch('/api/grace/realtime-token', { method: 'POST' })
      if (!tr.ok) throw new Error('token')
      tok = await tr.json()
    } catch {
      micStream.getTracks().forEach((t) => t.stop()); micStreamRef.current = null
      return "I'm having trouble starting voice right now. You can keep typing to me."
    }

    voiceRef.current = tok.voice
    instructionsRef.current = tok.instructions
    greetedRef.current = false
    activeRef.current = true
    setActive(true)
    setOrb('thinking')

    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    try { ctxRef.current = new AC({ sampleRate: 24000 }) }
    catch { try { ctxRef.current = new AC() } catch { stop(); return 'Voice is not supported in this browser.' } }
    const ctx = ctxRef.current!
    if (ctx.state === 'suspended') { try { await ctx.resume() } catch {} }
    playHeadRef.current = ctx.currentTime

    micSrcRef.current = ctx.createMediaStreamSource(micStream)
    procRef.current = ctx.createScriptProcessor(2048, 1, 1)
    muteRef.current = ctx.createGain()
    muteRef.current.gain.value = 0 // keep the processor alive without leaking mic to speakers
    const inRate = ctx.sampleRate
    procRef.current.onaudioprocess = (ev) => {
      if (!activeRef.current) return
      const inp = ev.inputBuffer.getChannelData(0)
      let s = 0
      for (let i = 0; i < inp.length; i++) s += inp[i] * inp[i]
      const urms = Math.sqrt(s / inp.length)
      userLvlRef.current = userLvlRef.current * 0.5 + Math.min(1, Math.max(0, (urms - 0.006) * 12)) * 0.5
      const ratio = inRate / 24000
      const outLen = Math.max(1, Math.floor(inp.length / ratio))
      const out = new Int16Array(outLen)
      for (let i = 0; i < outLen; i++) { const v = Math.max(-1, Math.min(1, inp[Math.floor(i * ratio)] || 0)); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff }
      const b = new Uint8Array(out.buffer)
      let bin = ''
      for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i])
      send({ type: 'input_audio_buffer.append', audio: btoa(bin) })
    }
    micSrcRef.current.connect(procRef.current)
    procRef.current.connect(muteRef.current)
    muteRef.current.connect(ctx.destination)

    try {
      wsRef.current = new WebSocket('wss://api.x.ai/v1/realtime?model=grok-voice-latest', ['xai-client-secret.' + tok.token])
    } catch {
      stop(); return "Voice couldn't connect. You can keep typing to me."
    }
    wsRef.current.onmessage = (m) => { let e: any; try { e = JSON.parse(m.data) } catch { return } onEvent(e) }
    wsRef.current.onerror = () => {}
    wsRef.current.onclose = () => { if (activeRef.current) stop() }

    if (visRafRef.current) cancelAnimationFrame(visRafRef.current)
    visRafRef.current = requestAnimationFrame(visFrame)
    return null
  }, [stop])

  // Tap the orb while she's talking to interrupt by hand.
  const interrupt = useCallback(() => {
    if (activeRef.current) { flushPlayback(); send({ type: 'input_audio_buffer.clear' }); setOrb('listening') }
  }, [])

  return { active, orbState, capUser, capBot, orbRef, start, stop, interrupt }
}

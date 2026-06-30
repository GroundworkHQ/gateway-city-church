'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'

const CHURCH_LAT = 36.2250
const CHURCH_LNG = -115.2190
const FENCE_RADIUS_METERS = 150

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function VisitPage() {
  const { churchId } = useParams() as { churchId: string }
  const [step, setStep] = useState<'form' | 'tracking' | 'done'>('form')
  const [visitorId, setVisitorId] = useState<string | null>(null)
  const [isReturning, setIsReturning] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'tracking' | 'exited'>('idle')
  const watchIdRef = useRef<number | null>(null)
  const exitFiredRef = useRef(false)
  const insideRef = useRef(true)

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    how_heard: '',
    prayer_request: '',
    service_preference: 'english',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)

    const { first_name, last_name, ...rest } = form
    const res = await fetch('/api/visitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ church_id: churchId, ...rest, name: `${first_name.trim()} ${last_name.trim()}` }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      setSubmitted(false)
      return
    }

    setVisitorId(data.visitor_id)
    setIsReturning(data.is_returning)
    setStep('tracking')
  }

  function startGeofence() {
    if (!navigator.geolocation || !visitorId) return
    setGpsStatus('tracking')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const dist = haversineDistance(pos.coords.latitude, pos.coords.longitude, CHURCH_LAT, CHURCH_LNG)
        const isInside = dist <= FENCE_RADIUS_METERS

        if (!isInside && insideRef.current && !exitFiredRef.current) {
          exitFiredRef.current = true
          insideRef.current = false
          setGpsStatus('exited')

          fetch('/api/geofence/exit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visitor_id: visitorId, church_id: churchId }),
          })

          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current)
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [])

  if (step === 'form') {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-[#B8832A] text-4xl mb-3" style={{fontFamily:'Georgia,serif',fontStyle:'normal'}}>&#10013;</div>
            <h1 className="text-[#B8832A] text-2xl font-serif">Gateway City Church</h1>
            <p className="text-white/50 text-sm mt-1">Las Vegas Campus · Connection Card</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/60 text-xs uppercase tracking-widest mb-1">First Name *</label>
                <input
                  required
                  value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#B8832A] transition-colors"
                  placeholder="First"
                />
              </div>
              <div>
                <label className="block text-white/60 text-xs uppercase tracking-widest mb-1">Last Name *</label>
                <input
                  required
                  value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#B8832A] transition-colors"
                  placeholder="Last"
                />
              </div>
            </div>

            <div>
              <label className="block text-white/60 text-xs uppercase tracking-widest mb-1">Phone Number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#B8832A] transition-colors"
                placeholder="(702) 555-0000"
              />
            </div>

            <div>
              <label className="block text-white/60 text-xs uppercase tracking-widest mb-1">Email Address *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#B8832A] transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-white/60 text-xs uppercase tracking-widest mb-1">Service</label>
              <select
                value={form.service_preference}
                onChange={e => setForm(f => ({ ...f, service_preference: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#B8832A] transition-colors"
              >
                <option value="english">English Service — 10:00 AM</option>
                <option value="spanish">Spanish Service — 1:00 PM</option>
              </select>
            </div>

            <div>
              <label className="block text-white/60 text-xs uppercase tracking-widest mb-1">How did you hear about us?</label>
              <select
                value={form.how_heard}
                onChange={e => setForm(f => ({ ...f, how_heard: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#B8832A] transition-colors"
              >
                <option value="">Select one</option>
                <option value="friend">A friend or family member</option>
                <option value="social_media">Social media</option>
                <option value="google">Google search</option>
                <option value="drove_by">Drove by</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-white/60 text-xs uppercase tracking-widest mb-1">Prayer Request</label>
              <textarea
                value={form.prayer_request}
                onChange={e => setForm(f => ({ ...f, prayer_request: e.target.value }))}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#B8832A] transition-colors resize-none"
                placeholder="Share anything you'd like us to pray for..."
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitted}
              className="w-full bg-[#B8832A] hover:bg-[#b8852e] disabled:opacity-50 text-[#0D1B2A] font-semibold py-3 rounded-lg transition-colors font-serif text-base"
            >
              {submitted ? 'Submitting...' : 'Submit Connection Card'}
            </button>
          </form>

          <p className="text-center text-white/30 text-xs mt-4">
            Your information is kept private and used only to connect with you.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'tracking') {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-[#B8832A] text-5xl mb-4" style={{fontFamily:'Georgia,serif',fontStyle:'normal'}}>&#10013;</div>
          <h1 className="text-[#B8832A] text-2xl font-serif mb-2">Gateway City Church</h1>

          {isReturning ? (
            <p className="text-white/70 text-base mb-6">Welcome back! Great to see you again.</p>
          ) : (
            <p className="text-white/70 text-base mb-6">
              Welcome! Your connection card has been received and a welcome email is on its way.
            </p>
          )}

          {gpsStatus === 'idle' && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-4">
              <p className="text-white/60 text-sm mb-4 text-balance">
                Allow location access so we can follow up with a personal thank you and helpful resources when you leave today.
              </p>
              <button
                onClick={startGeofence}
                className="w-full bg-[#B8832A] hover:bg-[#b8852e] text-[#0D1B2A] font-semibold py-3 rounded-lg transition-colors font-serif"
              >
                Allow Location Access
              </button>
              <p className="text-white/30 text-xs mt-3">Keep this tab open while you are here.</p>
            </div>
          )}

          {gpsStatus === 'tracking' && (
            <div className="bg-[#B8832A]/10 border border-[#B8832A]/30 rounded-xl p-6">
              <div className="w-3 h-3 bg-[#B8832A] rounded-full mx-auto mb-3 animate-pulse" />
              <p className="text-[#B8832A] text-sm font-medium">You're all set</p>
              <p className="text-white/50 text-xs mt-1">We'll follow up when you leave. Enjoy the service!</p>
            </div>
          )}

          {gpsStatus === 'exited' && (
            <div className="bg-[#B8832A]/10 border border-[#B8832A]/30 rounded-xl p-6">
              <p className="text-[#B8832A] font-serif text-lg mb-1">It was great having you!</p>
              <p className="text-white/50 text-sm">A personal thank you and resources are on their way. We hope to see you next Sunday!</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

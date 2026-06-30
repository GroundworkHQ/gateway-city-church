'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Visitor, SmsMessage, VisitorNote, Attendance, EmailLog } from '@/types'

interface Props {
  visitorId: string
  churchId: string
  onBack?: () => void
  onDelete?: () => void
}

export default function VisitorDetail({ visitorId, churchId, onBack, onDelete }: Props) {
  const [visitor, setVisitor] = useState<Visitor | null>(null)
  const [thread, setThread] = useState<{ id: string } | null>(null)
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [notes, setNotes] = useState<VisitorNote[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [emailLog, setEmailLog] = useState<EmailLog[]>([])
  const [reply, setReply] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [channel, setChannel] = useState<'sms' | 'email'>('sms')
  const [noteBody, setNoteBody] = useState('')
  const [noteTag, setNoteTag] = useState('')
  const [sending, setSending] = useState(false)
  const [tab, setTab] = useState<'activity' | 'messages' | 'notes'>('activity')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editingEmail, setEditingEmail] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteAttendance, setConfirmDeleteAttendance] = useState<string | null>(null)
  const [prayerInput, setPrayerInput] = useState('')
  const [addingPrayer, setAddingPrayer] = useState(false)
  const [editingPrayer, setEditingPrayer] = useState(false)
  const [editPrayerText, setEditPrayerText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [loggingVisit, setLoggingVisit] = useState(false)
  const [visitService, setVisitService] = useState('')
  const [insight, setInsight] = useState<string | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [simulatingExit, setSimulatingExit] = useState(false)
  const [exitSent, setExitSent] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setVisitor(null)
    setThread(null)
    setMessages([])
    setNotes([])
    setAttendance([])
    setEmailLog([])
    setTab('activity')
    setChannel('sms')
    setConfirmDelete(false)
    setLoggingVisit(false)
    setVisitService('')
    setInsight(null)
    setExitSent(false)

    async function load() {
      const [{ data: v }, { data: t }, { data: a }, { data: e }, { data: n }] = await Promise.all([
        supabase.from('church_visitors').select('*').eq('id', visitorId).single(),
        supabase.from('church_sms_threads').select('id').eq('visitor_id', visitorId).maybeSingle(),
        supabase.from('church_attendance').select('*').eq('visitor_id', visitorId).order('visited_at', { ascending: false }),
        supabase.from('church_email_log').select('*').eq('visitor_id', visitorId).order('sent_at', { ascending: false }),
        supabase.from('church_visitor_notes').select('*').eq('visitor_id', visitorId).order('created_at', { ascending: false }),
      ])
      setVisitor(v)
      setEditEmail(v?.email ?? '')
      setEditPhone(v?.phone ?? '')
      setThread(t)
      setAttendance(a ?? [])
      setEmailLog(e ?? [])
      setNotes(n ?? [])

      if (t?.id) {
        const { data: msgs } = await supabase
          .from('church_sms_messages').select('*').eq('thread_id', t.id).order('sent_at', { ascending: true })
        setMessages(msgs ?? [])
      }
    }
    load()
  }, [visitorId])

  useEffect(() => {
    if (!thread?.id) return
    const channel = supabase
      .channel('sms-' + thread.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'church_sms_messages', filter: `thread_id=eq.${thread.id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as SmsMessage])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [thread?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function saveField(field: 'email' | 'phone', value: string) {
    setSaving(true)
    await fetch(`/api/visitors/${visitorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    setVisitor(prev => prev ? { ...prev, [field]: value } : prev)
    if (field === 'email') setEditingEmail(false)
    if (field === 'phone') setEditingPhone(false)
    setSaving(false)
  }

  async function sendReply() {
    if (!reply.trim()) return
    setSending(true)
    if (channel === 'sms' && thread?.id) {
      await fetch(`/api/sms/${thread.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply }),
      })
    } else if (channel === 'email') {
      const res = await fetch(`/api/visitors/${visitorId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailSubject || 'A message from Gateway City Church', body: reply }),
      })
      const newLog = await res.json()
      if (newLog?.id) setEmailLog(prev => [newLog, ...prev])
    }
    setReply('')
    setEmailSubject('')
    setSending(false)
  }

  async function addNote() {
    if (!noteBody.trim()) return
    const res = await fetch(`/api/visitors/${visitorId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: noteBody, tag: noteTag || null }),
    })
    const data = await res.json()
    setNotes(prev => [data, ...prev])
    setNoteBody('')
    setNoteTag('')
  }

  async function manualCheckin() {
    await fetch(`/api/visitors/${visitorId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ church_id: churchId, service_type: visitService || null }),
    })
    const { data } = await supabase
      .from('church_attendance').select('*').eq('visitor_id', visitorId).order('visited_at', { ascending: false })
    setAttendance(data ?? [])
    setLoggingVisit(false)
    setVisitService('')
  }

  async function handleDelete() {
    await fetch(`/api/visitors/${visitorId}`, { method: 'DELETE' })
    onDelete?.()
  }

  async function loadInsight() {
    setLoadingInsight(true)
    const res = await fetch(`/api/visitors/${visitorId}/insight`)
    const data = await res.json()
    setInsight(data.insight ?? null)
    setLoadingInsight(false)
  }

  async function simulateGeofenceExit() {
    if (!visitor?.phone) return
    setSimulatingExit(true)
    await fetch('/api/geofence/exit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_id: visitorId, church_id: churchId }),
    })
    setSimulatingExit(false)
    setExitSent(true)
    setTimeout(() => setExitSent(false), 4000)
  }

  async function suggestReply() {
    setSuggesting(true)
    const recentMessages = messages.slice(-6).map(m => ({ direction: m.direction, body: m.body }))
    const res = await fetch(`/api/visitors/${visitorId}/suggest-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, recentMessages }),
    })
    const data = await res.json()
    if (data.suggestion) setReply(data.suggestion)
    if (data.subject) setEmailSubject(data.subject)
    setSuggesting(false)
  }

  if (!visitor) {
    return <div className="flex-1 flex items-center justify-center"><div className="text-[#B8832A] text-sm">Loading...</div></div>
  }

  const initials = visitor.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  function formatPhone(phone: string) {
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    return phone
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Record header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10 flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-white/50 hover:border-white/30 hover:text-white transition-colors text-base flex-shrink-0">←</button>
        )}
        <div className="w-10 h-10 rounded-full bg-[#B8832A]/20 flex items-center justify-center text-[#B8832A] font-serif flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-white font-semibold text-base">{visitor.name}</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              visitor.is_returning
                ? 'bg-blue-500/20 border border-blue-400/40 text-blue-300'
                : 'bg-white/15 border border-white/40 text-white'
            }`}>
              {visitor.is_returning ? 'Returning' : 'First Time'}
            </span>
            {visitor.prayer_request && (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-[#B8832A]/20 border border-[#B8832A]/60 text-[#B8832A]">Prayer</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {loggingVisit ? (
            <div className="flex items-center gap-2">
              <select
                value={visitService}
                onChange={e => setVisitService(e.target.value)}
                autoFocus
                className="bg-white/5 border border-[#B8832A]/40 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none"
              >
                <option value="">Service...</option>
                <option value="english">English</option>
                <option value="spanish">Spanish</option>
              </select>
              <button
                onClick={manualCheckin}
                disabled={!visitService}
                className="px-3 py-1.5 bg-[#B8832A] text-[#0D1B2A] text-xs rounded-lg font-semibold hover:bg-[#b8852e] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Log
              </button>
              <button
                onClick={() => { setLoggingVisit(false); setVisitService('') }}
                className="px-2 py-1.5 border border-white/10 text-white/30 text-xs rounded-lg hover:border-white/20 transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setLoggingVisit(true)}
              className="px-3 py-1.5 border border-[#B8832A]/40 text-[#B8832A] text-xs rounded-lg hover:bg-[#B8832A]/10 transition-colors"
            >
              + Log Visit
            </button>
          )}
          {visitor?.phone && (
            <button
              onClick={simulateGeofenceExit}
              disabled={simulatingExit || exitSent}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors border ${
                exitSent
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
              }`}
            >
              {exitSent ? '✓ SMS Sent' : simulatingExit ? '...' : 'Simulate Exit'}
            </button>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-xs">Sure?</span>
              <button onClick={handleDelete} className="px-3 py-1.5 bg-red-500/20 border border-red-500/40 text-red-400 text-xs rounded-lg hover:bg-red-500/30 transition-colors">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 border border-white/10 text-white/40 text-xs rounded-lg hover:border-white/20 transition-colors">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 border border-white/10 text-white/30 text-xs rounded-lg hover:border-red-500/30 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Body: properties left, comms right */}
      <div className="flex flex-1 overflow-hidden">

        {/* Properties panel */}
        <div className="w-72 border-r border-white/10 overflow-y-auto flex-shrink-0">

          {/* Contact */}
          <div className="px-5 py-5 border-b border-white/10 space-y-4">
            <p className="text-white/30 text-xs uppercase tracking-widest">Contact</p>
            <div>
              <p className="text-white/40 text-xs mb-1">Email</p>
              {editingEmail ? (
                <div className="flex gap-2">
                  <input autoFocus value={editEmail} onChange={e => setEditEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveField('email', editEmail); if (e.key === 'Escape') setEditingEmail(false) }}
                    className="flex-1 min-w-0 bg-white/5 border border-[#B8832A]/40 rounded px-2 py-1 text-white text-sm focus:outline-none" />
                  <button onClick={() => saveField('email', editEmail)} disabled={saving} className="text-[#B8832A] text-xs flex-shrink-0">Save</button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <span className="text-white text-sm truncate">{visitor.email || '—'}</span>
                  <button onClick={() => setEditingEmail(true)} className="text-white/20 hover:text-[#B8832A] text-xs ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                </div>
              )}
            </div>
            <div>
              <p className="text-white/40 text-xs mb-1">Phone</p>
              {editingPhone ? (
                <div className="flex gap-2">
                  <input autoFocus value={editPhone} onChange={e => setEditPhone(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveField('phone', editPhone); if (e.key === 'Escape') setEditingPhone(false) }}
                    className="flex-1 min-w-0 bg-white/5 border border-[#B8832A]/40 rounded px-2 py-1 text-white text-sm focus:outline-none" />
                  <button onClick={() => saveField('phone', editPhone)} disabled={saving} className="text-[#B8832A] text-xs flex-shrink-0">Save</button>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  {visitor.phone ? (
                    <a href={`tel:${visitor.phone}`} className="text-[#B8832A] text-sm underline underline-offset-2 hover:text-[#d4a045] transition-colors">{formatPhone(visitor.phone)}</a>
                  ) : (
                    <span className="text-white text-sm">—</span>
                  )}
                  <button onClick={() => setEditingPhone(true)} className="text-white/20 hover:text-[#B8832A] text-xs ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="px-5 py-5 border-b border-white/10 space-y-3">
            <p className="text-white/30 text-xs uppercase tracking-widest">Details</p>
            {[
              { label: 'Visits', value: <span className="text-[#B8832A] font-serif">{attendance.length}</span> },
              { label: 'Service', value: <span className="capitalize">{visitor.service_preference ?? '—'}</span> },
              { label: 'Found us via', value: <span className="capitalize">{visitor.how_heard?.replace(/_/g, ' ') || '—'}</span> },
              { label: 'Emails sent', value: emailLog.length },
              { label: 'First visit', value: new Date(visitor.created_at).toLocaleDateString() },
              { label: 'Last visit', value: attendance.length > 0 ? new Date(attendance[0].visited_at).toLocaleDateString() : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-white/40 text-sm">{label}</span>
                <span className="text-white text-sm">{value}</span>
              </div>
            ))}
          </div>

          {/* AI Insight */}
          <div className="px-5 py-5 border-b border-white/10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/30 text-xs uppercase tracking-widest">Pastoral Snapshot</p>
              <button
                onClick={loadInsight}
                disabled={loadingInsight}
                className="text-[#B8832A]/60 hover:text-[#B8832A] text-xs transition-colors disabled:opacity-40"
              >
                {loadingInsight ? '...' : insight ? 'Refresh' : '✦ Generate'}
              </button>
            </div>
            {insight ? (
              <p className="text-white/60 text-sm leading-relaxed">{insight}</p>
            ) : (
              <p className="text-white/20 text-sm">{loadingInsight ? 'Generating...' : 'Click generate for a pastoral snapshot.'}</p>
            )}
          </div>

          {/* Prayer Requests */}
          <div className="px-5 py-5 border-b border-white/10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/30 text-xs uppercase tracking-widest">Prayer Requests</p>
              <button
                onClick={() => setAddingPrayer(p => !p)}
                className="text-[#B8832A]/60 hover:text-[#B8832A] text-xs transition-colors"
              >
                + Add
              </button>
            </div>

            {/* Original from registration */}
            {visitor.prayer_request && (
              <div className="mb-3 pb-3 border-b border-white/5 group">
                {editingPrayer ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={editPrayerText}
                      onChange={e => setEditPrayerText(e.target.value)}
                      rows={3}
                      className="w-full bg-white/5 border border-[#B8832A]/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await fetch(`/api/visitors/${visitorId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prayer_request: editPrayerText }),
                          })
                          setVisitor(prev => prev ? { ...prev, prayer_request: editPrayerText } : prev)
                          setEditingPrayer(false)
                        }}
                        disabled={!editPrayerText.trim()}
                        className="flex-1 py-1.5 bg-[#B8832A] hover:bg-[#b8852e] disabled:opacity-40 text-[#0D1B2A] text-xs font-semibold rounded-lg transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingPrayer(false)}
                        className="px-3 py-1.5 border border-white/10 text-white/30 text-xs rounded-lg hover:border-white/20 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-white/70 text-sm leading-relaxed">{visitor.prayer_request}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-white/25 text-xs">{new Date(visitor.created_at).toLocaleDateString()} · from registration</p>
                      <button
                        onClick={() => { setEditPrayerText(visitor.prayer_request ?? ''); setEditingPrayer(true) }}
                        className="text-white/20 hover:text-[#B8832A] text-xs opacity-0 group-hover:opacity-100 transition-all"
                      >
                        Edit
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Prayer notes added after */}
            {notes.filter(n => n.tag === 'prayer-request').map(n => (
              <div key={n.id} className="mb-3 pb-3 border-b border-white/5 last:border-0 last:mb-0 last:pb-0 group">
                {editingNoteId === n.id ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={editNoteText}
                      onChange={e => setEditNoteText(e.target.value)}
                      rows={3}
                      className="w-full bg-white/5 border border-[#B8832A]/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await fetch(`/api/visitors/${visitorId}/notes/${n.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ body: editNoteText }),
                          })
                          setNotes(prev => prev.map(note => note.id === n.id ? { ...note, body: editNoteText } : note))
                          setEditingNoteId(null)
                        }}
                        disabled={!editNoteText.trim()}
                        className="flex-1 py-1.5 bg-[#B8832A] hover:bg-[#b8852e] disabled:opacity-40 text-[#0D1B2A] text-xs font-semibold rounded-lg transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingNoteId(null)}
                        className="px-3 py-1.5 border border-white/10 text-white/30 text-xs rounded-lg hover:border-white/20 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-white/70 text-sm leading-relaxed">{n.body}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-white/25 text-xs">{new Date(n.created_at).toLocaleDateString()}</p>
                      <button
                        onClick={() => { setEditNoteText(n.body); setEditingNoteId(n.id) }}
                        className="text-white/20 hover:text-[#B8832A] text-xs opacity-0 group-hover:opacity-100 transition-all"
                      >
                        Edit
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {!visitor.prayer_request && notes.filter(n => n.tag === 'prayer-request').length === 0 && !addingPrayer && (
              <p className="text-white/20 text-sm">No prayer requests.</p>
            )}

            {/* Inline add */}
            {addingPrayer && (
              <div className="mt-2 space-y-2">
                <textarea
                  autoFocus
                  value={prayerInput}
                  onChange={e => setPrayerInput(e.target.value)}
                  placeholder="Enter prayer request..."
                  rows={2}
                  className="w-full bg-white/5 border border-[#B8832A]/30 rounded-lg px-3 py-2 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#B8832A] transition-colors resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!prayerInput.trim()) return
                      const res = await fetch(`/api/visitors/${visitorId}/notes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ body: prayerInput, tag: 'prayer-request' }),
                      })
                      const data = await res.json()
                      setNotes(prev => [data, ...prev])
                      setPrayerInput('')
                      setAddingPrayer(false)
                    }}
                    disabled={!prayerInput.trim()}
                    className="flex-1 py-1.5 bg-[#B8832A] hover:bg-[#b8852e] disabled:opacity-40 text-[#0D1B2A] text-xs font-semibold rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setAddingPrayer(false); setPrayerInput('') }}
                    className="px-3 py-1.5 border border-white/10 text-white/30 text-xs rounded-lg hover:border-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Comms panel */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-white/10 px-6 flex-shrink-0">
            {([
              { key: 'activity', label: 'Activity' },
              { key: 'messages', label: 'Messages' },
              { key: 'notes', label: notes.length ? `Notes (${notes.length})` : 'Notes' },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-3 text-xs uppercase tracking-widest border-b-2 transition-colors ${
                  tab === key ? 'border-[#B8832A] text-[#B8832A]' : 'border-transparent text-white/40 hover:text-white/60'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Activity Feed */}
          {tab === 'activity' && (() => {
            const items = [
              ...attendance.map(a => ({ type: 'visit' as const, id: a.id, date: new Date(a.visited_at), label: a.service_type ? `${a.service_type.charAt(0).toUpperCase() + a.service_type.slice(1)} Service` : 'Visit' })),
              ...emailLog.map(e => ({ type: 'email' as const, id: e.id, date: new Date(e.sent_at), label: `Email Sent: ${e.email_type === 'welcome_1' ? 'Welcome' : e.email_type === 'followup_2' ? 'Follow-up 2' : e.email_type === 'followup_3' ? 'Follow-up 3' : e.subject ?? 'Manual'}`, opened: !!e.opened_at })),
              ...notes.map(n => ({ type: 'note' as const, id: n.id, date: new Date(n.created_at), label: n.body, tag: n.tag })),
              ...(visitor.prayer_request ? [{ type: 'prayer' as const, id: 'initial-prayer', date: new Date(visitor.created_at), label: visitor.prayer_request }] : []),
            ].sort((a, b) => b.date.getTime() - a.date.getTime())

            async function deleteAttendance(id: string) {
              await fetch(`/api/visitors/${visitorId}/attendance/${id}`, { method: 'DELETE' })
              setAttendance(prev => prev.filter(a => a.id !== id))
              setConfirmDeleteAttendance(null)
            }

            return (
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {items.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-16">No activity yet.</p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
                    <div className="space-y-5">
                      {items.map((item, i) => (
                        <div key={i} className="flex gap-4 items-start group">
                          <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 mt-0.5 ring-2 ring-[#0D1B2A] ${
                            item.type === 'visit' ? 'bg-blue-400' :
                            item.type === 'email' ? 'bg-[#B8832A]' :
                            item.type === 'prayer' ? 'bg-[#B8832A]/60' :
                            'bg-white/40'
                          }`} />
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-center gap-2">
                              <p className="text-white text-sm leading-snug">
                                {item.type === 'prayer' && <span className="text-[#B8832A]/70 mr-1">✝</span>}
                                {item.label}
                              </p>
                              {item.type === 'visit' && (
                                confirmDeleteAttendance === item.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-white/40 text-xs">Sure?</span>
                                    <button onClick={() => deleteAttendance(item.id)} className="text-red-400 text-xs hover:text-red-300 transition-colors">Delete</button>
                                    <button onClick={() => setConfirmDeleteAttendance(null)} className="text-white/30 text-xs hover:text-white/50 transition-colors">Cancel</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDeleteAttendance(item.id)}
                                    className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 text-xs transition-all leading-none"
                                  >
                                    ✕
                                  </button>
                                )
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {item.type === 'email' && item.opened && (
                                <span className="text-[#B8832A]/70 text-xs">Opened</span>
                              )}
                              {item.type === 'note' && item.tag && (
                                <span className="text-xs px-1.5 py-0.5 rounded border border-[#B8832A]/30 text-[#B8832A]/60">{item.tag}</span>
                              )}
                              <span className="text-white/30 text-xs">{item.date.toLocaleDateString()} {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Unified Inbox */}
          {tab === 'messages' && (() => {
            const unifiedItems = [
              ...messages.map(m => ({
                id: m.id,
                type: 'sms' as const,
                direction: m.direction,
                body: m.body,
                date: new Date(m.sent_at),
              })),
              ...emailLog.map(e => ({
                id: e.id,
                type: 'email' as const,
                direction: (e.direction ?? 'outbound') as 'inbound' | 'outbound',
                body: e.body ?? e.email_type.replace(/_/g, ' '),
                subject: e.subject ?? e.email_type.replace(/_/g, ' '),
                date: new Date(e.sent_at),
                opened: !!e.opened_at,
              })),
            ].sort((a, b) => a.date.getTime() - b.date.getTime())

            const hasNoEmail = !visitor.email
            const canSendSms = !!thread
            const placeholder = channel === 'email'
              ? hasNoEmail ? 'No email on file — add one in Contact' : 'Write an email...'
              : canSendSms ? 'Text message...' : 'No SMS thread yet — opens on first text'

            return (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Thread */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                  {unifiedItems.length === 0 && (
                    <p className="text-white/30 text-sm text-center py-16">No messages yet.</p>
                  )}
                  {unifiedItems.map(item => (
                    <div key={item.id} className={`flex flex-col gap-0.5 ${item.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-xs ${item.type === 'email' ? 'text-[#B8832A]/60' : 'text-white/30'}`}>
                          {item.type === 'email' ? '✉' : '✉ SMS'}
                        </span>
                        <span className="text-white/20 text-xs">{item.date.toLocaleDateString()} {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {item.type === 'email' && item.opened && (
                          <span className="text-[#B8832A]/50 text-xs">· Opened</span>
                        )}
                      </div>
                      <div className={`max-w-sm px-4 py-2.5 rounded-2xl text-sm ${
                        item.direction === 'outbound'
                          ? item.type === 'email' ? 'bg-[#B8832A]/20 border border-[#B8832A]/30 text-white' : 'bg-[#B8832A] text-[#0D1B2A]'
                          : 'bg-white/10 text-white'
                      }`}>
                        {item.type === 'email' && 'subject' in item && item.subject && (
                          <p className="font-semibold text-xs mb-1 opacity-70">{item.subject}</p>
                        )}
                        <p>{item.body}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Compose */}
                <div className="px-6 py-4 border-t border-white/10 flex-shrink-0 space-y-3">
                  {/* Channel toggle */}
                  <div className="flex gap-1">
                    {(['sms', 'email'] as const).map(ch => (
                      <button
                        key={ch}
                        onClick={() => setChannel(ch)}
                        className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                          channel === ch
                            ? 'bg-[#B8832A] text-[#0D1B2A] border-[#B8832A]'
                            : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
                        }`}
                      >
                        {ch === 'sms' ? 'SMS' : 'Email'}
                      </button>
                    ))}
                  </div>

                  {/* Subject line for email */}
                  {channel === 'email' && (
                    <input
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      placeholder="Subject (optional)"
                      disabled={hasNoEmail}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#B8832A] transition-colors disabled:opacity-40"
                    />
                  )}

                  {/* Message + send */}
                  <div className="flex gap-3">
                    <textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                      placeholder={placeholder}
                      disabled={(channel === 'sms' && !canSendSms) || (channel === 'email' && hasNoEmail)}
                      rows={5}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#B8832A] transition-colors resize-none disabled:opacity-40"
                    />
                    <div className="flex flex-col gap-2 self-end">
                      <button
                        onClick={suggestReply}
                        disabled={suggesting || (channel === 'sms' && !canSendSms) || (channel === 'email' && hasNoEmail)}
                        title="AI suggest reply"
                        className="border border-[#B8832A]/40 text-[#B8832A] hover:bg-[#B8832A]/10 disabled:opacity-30 px-3 rounded-xl text-xs font-medium transition-colors py-2"
                      >
                        {suggesting ? '...' : '✦ AI'}
                      </button>
                      <button
                        onClick={sendReply}
                        disabled={sending || !reply.trim() || (channel === 'sms' && !canSendSms) || (channel === 'email' && hasNoEmail)}
                        className="bg-[#B8832A] hover:bg-[#b8852e] disabled:opacity-40 text-[#0D1B2A] px-5 rounded-xl text-sm font-semibold transition-colors py-2.5"
                      >
                        {sending ? '...' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Notes */}
          {tab === 'notes' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex gap-3 flex-shrink-0">
                <div className="flex-1 space-y-2">
                  <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)}
                    placeholder="Add a note..." rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#B8832A] transition-colors resize-none" />
                  <select value={noteTag} onChange={e => setNoteTag(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/50 text-xs focus:outline-none">
                    <option value="">No tag</option>
                    <option value="first-time">First time</option>
                    <option value="needs-follow-up">Needs follow-up</option>
                    <option value="connected-with-pastor">Connected with pastor</option>
                    <option value="prayer-request">Prayer request</option>
                    <option value="new-believer">New believer</option>
                    <option value="volunteer-interest">Volunteer interest</option>
                  </select>
                </div>
                <button onClick={addNote} disabled={!noteBody.trim()}
                  className="bg-[#B8832A] hover:bg-[#b8852e] disabled:opacity-40 text-[#0D1B2A] px-5 rounded-lg font-semibold text-sm transition-colors self-start">
                  Add
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                {notes.length === 0 && <p className="text-white/30 text-sm text-center py-16">No notes yet.</p>}
                {notes.map(note => (
                  <div key={note.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-white text-sm leading-relaxed">{note.body}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {note.tag && <span className="text-xs px-2 py-0.5 rounded-full border border-[#B8832A]/30 text-[#B8832A]/70">{note.tag}</span>}
                      <span className="text-white/30 text-xs">{new Date(note.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import type { Visitor, Church } from '@/types'
import VisitorDetail from './VisitorDetail'
import { useGraceVoice } from './useGraceVoice'

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(dateStr).toLocaleDateString()
}

const HOW_HEARD_OPTIONS = ['friend', 'social_media', 'google', 'flyer', 'walked_by', 'other']
const HOW_HEARD_LABELS: Record<string, string> = {
  friend: 'A friend or family member',
  social_media: 'Social media',
  google: 'Google search',
  flyer: 'Flyer',
  walked_by: 'Walked by',
  other: 'Other',
}

export default function AdminDashboard() {
  const { churchId } = useParams() as { churchId: string }
  const router = useRouter()
  const [church, setChurch] = useState<Church | null>(null)
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'new' | 'returning' | 'prayer'>('all')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Visitor | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showQR, setShowQR] = useState(false)

  // Grace - natural language search (text) + Grok realtime voice
  const [showGrace, setShowGrace] = useState(false)
  const [graceQuery, setGraceQuery] = useState('')
  const [graceLoading, setGraceLoading] = useState(false)

  const [graceMessages, setGraceMessages] = useState<Array<{ role: 'user' | 'grace'; text: string; ids?: string[] }>>([])
  const graceChatRef = useRef<HTMLDivElement>(null)

  function scrollGraceToBottom() {
    setTimeout(() => graceChatRef.current?.scrollTo({ top: graceChatRef.current.scrollHeight, behavior: 'smooth' }), 50)
  }

  // Voice Grace: hands-free orb over the chat. Reaches the same nlsearch brain via
  // the search_visitors function tool, and shares this message history both ways.
  const graceVoice = useGraceVoice({
    churchId,
    getHistory: () => graceMessages.map(m => ({ role: m.role, content: m.text })),
    onSearchResults: (ids, explanation) => {
      setGraceMessages(prev => [...prev, { role: 'grace', text: explanation, ids }])
      scrollGraceToBottom()
    },
    onSpokenTurn: (turn) => {
      setGraceMessages(prev => [...prev, { role: turn.role, text: turn.content }])
      scrollGraceToBottom()
    },
  })

  async function toggleGraceVoice() {
    if (graceVoice.active) { graceVoice.stop(); return }
    const err = await graceVoice.start()
    if (err) setGraceMessages(prev => [...prev, { role: 'grace', text: err }])
  }

  async function askGrace(query: string) {
    if (!query.trim()) return
    setGraceMessages(prev => [...prev, { role: 'user' as const, text: query }])
    setGraceQuery('')
    setGraceLoading(true)
    const res = await fetch('/api/visitors/nlsearch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, churchId }),
    })
    const data = await res.json()
    const responseText = data.explanation ?? 'No results found.'
    setGraceMessages(prev => [...prev, { role: 'grace' as const, text: responseText, ids: data.ids ?? [] }])
    setGraceLoading(false)
    scrollGraceToBottom()
  }

  function closeGrace() {
    graceVoice.stop()
    setShowGrace(false)
  }

  const qrRef = useRef<HTMLDivElement>(null)

  function downloadQR() {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const serialized = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([serialized], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gateway-city-church-qr.svg'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Add contact form state
  const [addForm, setAddForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', service_preference: '', how_heard: '',
    prayer_request: '', is_returning: false,
  })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: churchData }, { data: visitorData }] = await Promise.all([
        supabase.from('churches').select('*').eq('id', churchId).single(),
        supabase.from('church_visitors').select('*').eq('church_id', churchId).order('last_activity_at', { ascending: false }),
      ])
      setChurch(churchData)
      setVisitors(visitorData ?? [])
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('visitors')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'church_visitors', filter: `church_id=eq.${churchId}` }, (payload) => {
        setVisitors(prev => [payload.new as Visitor, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [churchId])

  const filtered = visitors.filter(v => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.email?.toLowerCase().includes(search.toLowerCase()) ||
      v.phone?.includes(search)
    const matchFilter = filter === 'all' || (filter === 'new' && !v.is_returning) || (filter === 'returning' && v.is_returning) || (filter === 'prayer' && !!v.prayer_request)
    return matchSearch && matchFilter
  })

  const totalNew = visitors.filter(v => !v.is_returning).length
  const totalReturning = visitors.filter(v => v.is_returning).length
  const withPrayer = visitors.filter(v => v.prayer_request).length

  function exportCSV(list: Visitor[], filename = 'visitors.csv') {
    const headers = ['Name', 'Email', 'Phone', 'Service', 'How Heard', 'Prayer Request', 'Returning', 'Opted Out', 'First Visit', 'Last Activity', 'Welcome Email', 'Follow-Up 2', 'Follow-Up 3']
    const rows = list.map(v => [
      v.name,
      v.email ?? '',
      v.phone ?? '',
      v.service_preference ? (v.service_preference.charAt(0).toUpperCase() + v.service_preference.slice(1)) : '',
      v.how_heard ? HOW_HEARD_LABELS[v.how_heard] ?? v.how_heard.replace(/_/g, ' ') : '',
      v.prayer_request ?? '',
      v.is_returning ? 'Yes' : 'No',
      v.opted_out ? 'Yes' : 'No',
      new Date(v.created_at).toLocaleDateString(),
      v.last_activity_at ? new Date(v.last_activity_at).toLocaleDateString() : '',
      v.email_1_sent_at ? new Date(v.email_1_sent_at).toLocaleDateString() : 'Not sent',
      v.email_2_sent_at ? new Date(v.email_2_sent_at).toLocaleDateString() : 'Not sent',
      v.email_3_sent_at ? new Date(v.email_3_sent_at).toLocaleDateString() : 'Not sent',
    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.first_name.trim() || !addForm.last_name.trim()) { setAddError('First and last name are required'); return }
    setAddSaving(true)
    setAddError('')
    const { first_name, last_name, ...rest } = addForm
    const res = await fetch('/api/visitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rest, name: `${first_name.trim()} ${last_name.trim()}`, church_id: churchId, skip_notifications: true }),
    })
    const data = await res.json()
    if (!res.ok) {
      setAddError(data.error ?? 'Something went wrong')
      setAddSaving(false)
      return
    }
    if (data.visitor) {
      setVisitors(prev => [data.visitor, ...prev.filter(v => v.id !== data.visitor.id)])
    }
    setShowAddModal(false)
    setAddForm({ first_name: '', last_name: '', email: '', phone: '', service_preference: '', how_heard: '', prayer_request: '', is_returning: false })
    setAddSaving(false)
  }

  if (loading) {
    return <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center"><div className="text-[#B8832A]">Loading...</div></div>
  }

  return (
    <div className="h-screen bg-[#0D1B2A] text-white flex flex-col">

      {/* Header */}
      <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/gcc-logo.png" alt="Gateway City Church" className="h-10 invert opacity-80" />
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-5 text-sm">
            <span onClick={() => setFilter('all')} className="text-white/70 cursor-pointer hover:text-white transition-colors"><span className="text-[#B8832A] font-medium">{visitors.length}</span> Total</span>
            <span onClick={() => setFilter('new')} className="text-white/70 cursor-pointer hover:text-white transition-colors"><span className="text-[#B8832A] font-medium">{totalNew}</span> New</span>
            <span onClick={() => setFilter('returning')} className="text-white/70 cursor-pointer hover:text-white/90 transition-colors"><span className="text-[#B8832A] font-medium">{totalReturning}</span> Returning</span>
            <span onClick={() => setFilter('prayer')} className="text-white/70 cursor-pointer hover:text-white/90 transition-colors"><span className="text-[#B8832A] font-medium">{withPrayer}</span> Prayer</span>
          </div>
          <div className="hidden md:block w-px h-5 bg-white/10" />
          <button
            onClick={() => exportCSV(filtered, 'gateway-visitors.csv')}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 border border-white/10 text-white/40 text-xs rounded-lg hover:border-white/20 hover:text-white/60 transition-colors"
          >
            Export
          </button>
          <button
            onClick={() => setShowQR(true)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 border border-white/10 text-white/40 text-xs rounded-lg hover:border-white/20 hover:text-white/60 transition-colors"
          >
            QR Code
          </button>
          <button
            onClick={() => { setShowGrace(v => !v); setGraceQuery('') }}
            className="flex items-center gap-1.5 pl-3 pr-4 py-1.5 rounded-full bg-gradient-to-r from-[#B8832A] to-[#d4a043] hover:opacity-90 transition-all shadow-[0_2px_12px_rgba(184,131,42,0.35)]"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[#0D1B2A]">
              <line x1="12" y1="2" x2="12" y2="22"/><line x1="5" y1="8" x2="19" y2="8"/>
            </svg>
            <span className="text-[#0D1B2A] font-semibold text-xs tracking-wide">Grace</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — list */}
        <div className="flex flex-col w-full md:w-72 lg:w-80 border-r border-white/10 flex-shrink-0">

          {/* Search + filters */}
          <div className="px-4 py-3 border-b border-white/10 space-y-2 flex-shrink-0">
            <div className="flex gap-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search visitors..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#B8832A] transition-colors"
              />
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-[#B8832A] hover:bg-[#b8852e] text-[#0D1B2A] px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
                title="Add contact"
              >
                +
              </button>
            </div>
            <div className="flex gap-2">
              {(['all', 'new', 'returning', 'prayer'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 py-1 rounded-md text-xs border transition-colors ${
                    filter === f
                      ? 'bg-[#B8832A] text-[#0D1B2A] border-[#B8832A] font-semibold'
                      : 'border-white/10 text-white/50 hover:border-white/30'
                  }`}
                >
                  {f === 'prayer' ? '✝' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Visitor list */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {filtered.length === 0 && (
              <div className="px-4 py-12 text-center text-white/30 text-sm">No visitors found.</div>
            )}
            {filtered.map(visitor => (
              <div
                key={visitor.id}
                onClick={() => {
                  if (window.innerWidth < 768) {
                    router.push(`/admin/${churchId}/visitors/${visitor.id}`)
                  } else {
                    setSelected(visitor)
                  }
                }}
                className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${
                  selected?.id === visitor.id ? 'bg-[#B8832A]/10 border-r-2 border-[#B8832A]' : 'hover:bg-white/5'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#B8832A] font-serif text-xs font-bold flex-shrink-0">
                  {visitor.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-white text-sm font-medium truncate">{visitor.name}</span>
                    {!visitor.is_returning && (
                      <span className="text-[10px] px-1 py-px rounded-full border border-white/25 text-white/70 bg-white/8 leading-none">New</span>
                    )}
                    {visitor.prayer_request && (
                      <span className="text-[10px] px-1 py-px rounded-full border border-[#B8832A]/30 text-[#B8832A]/60 leading-none">✝</span>
                    )}
                  </div>
                </div>
                <p className="text-white/20 text-xs flex-shrink-0 text-right">
                  {relativeTime(visitor.last_activity_at ?? visitor.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — full profile */}
        <div className="flex-1 hidden md:flex overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center relative overflow-hidden">
              <img
                src="/gcc-logo.png"
                alt=""
                className="w-96 opacity-45 pointer-events-none select-none invert mb-12"
              />
              <p className="text-white/20 text-sm flex items-center gap-3"><span className="text-xl">←</span> Select a visitor to view their profile</p>
            </div>
          ) : (
            <VisitorDetail
              key={selected.id}
              visitorId={selected.id}
              churchId={churchId}
              onBack={() => setSelected(null)}
              onDelete={() => setSelected(null)}
            />
          )}
        </div>

      </div>

      {/* QR Code Overlay */}
      {showQR && (
        <div className="fixed inset-0 bg-[#0D1B2A] flex flex-col items-center justify-center z-50">
          <button
            onClick={() => setShowQR(false)}
            className="absolute top-5 right-6 w-9 h-9 flex items-center justify-center border border-white/10 text-white/40 hover:text-white hover:border-white/30 rounded-lg transition-colors text-lg"
          >
            ×
          </button>
          <div className="text-[#B8832A] text-5xl mb-4">✝</div>
          <h1 className="text-[#B8832A] font-serif text-2xl mb-1">{church?.name}</h1>
          <p className="text-white/40 text-sm mb-10">Scan to fill out your connection card</p>
          <div ref={qrRef} className="bg-white p-6 rounded-2xl shadow-2xl">
            <QRCodeSVG
              value={`${process.env.NEXT_PUBLIC_APP_URL}/connect`}
              size={260}
              bgColor="#ffffff"
              fgColor="#0D1B2A"
              level="M"
            />
          </div>

          <div className="flex items-center gap-3 mt-10">
            <button
              onClick={() => window.print()}
              className="px-6 py-2.5 border border-[#B8832A]/40 text-[#B8832A] text-sm rounded-lg hover:bg-[#B8832A]/10 transition-colors"
            >
              Print
            </button>
            <button
              onClick={downloadQR}
              className="px-6 py-2.5 bg-[#B8832A]/10 border border-[#B8832A]/40 text-[#B8832A] text-sm rounded-lg hover:bg-[#B8832A]/20 transition-colors"
            >
              Download
            </button>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0D1B2A] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="text-white font-semibold">Add Contact</h2>
              <button onClick={() => { setShowAddModal(false); setAddError('') }} className="text-white/30 hover:text-white transition-colors text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAddContact} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-widest block mb-1.5">First Name <span className="text-[#B8832A]">*</span></label>
                  <input
                    required
                    value={addForm.first_name}
                    onChange={e => setAddForm(f => ({ ...f, first_name: e.target.value }))}
                    placeholder="First"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#B8832A] transition-colors"
                  />
                </div>
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-widest block mb-1.5">Last Name <span className="text-[#B8832A]">*</span></label>
                  <input
                    required
                    value={addForm.last_name}
                    onChange={e => setAddForm(f => ({ ...f, last_name: e.target.value }))}
                    placeholder="Last"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#B8832A] transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-widest block mb-1.5">Email</label>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#B8832A] transition-colors"
                  />
                </div>
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-widest block mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(702) 555-0100"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#B8832A] transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-widest block mb-1.5">Service</label>
                  <select
                    value={addForm.service_preference}
                    onChange={e => setAddForm(f => ({ ...f, service_preference: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white/70 text-sm focus:outline-none focus:border-[#B8832A] transition-colors"
                  >
                    <option value="">Unknown</option>
                    <option value="english">English</option>
                    <option value="spanish">Spanish</option>
                  </select>
                </div>
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-widest block mb-1.5">Found us via</label>
                  <select
                    value={addForm.how_heard}
                    onChange={e => setAddForm(f => ({ ...f, how_heard: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white/70 text-sm focus:outline-none focus:border-[#B8832A] transition-colors"
                  >
                    <option value="">Unknown</option>
                    {HOW_HEARD_OPTIONS.map(o => (
                      <option key={o} value={o}>{HOW_HEARD_LABELS[o] ?? o.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-white/40 text-xs uppercase tracking-widest block mb-1.5">Prayer Request</label>
                <textarea
                  value={addForm.prayer_request}
                  onChange={e => setAddForm(f => ({ ...f, prayer_request: e.target.value }))}
                  placeholder="Optional..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#B8832A] transition-colors resize-none"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addForm.is_returning}
                  onChange={e => setAddForm(f => ({ ...f, is_returning: e.target.checked }))}
                  className="w-4 h-4 accent-[#B8832A]"
                />
                <span className="text-white/60 text-sm">Mark as returning visitor</span>
              </label>
              {addError && <p className="text-red-400 text-sm">{addError}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setAddError('') }}
                  className="flex-1 py-2.5 border border-white/10 text-white/50 rounded-lg text-sm hover:border-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSaving || !addForm.first_name.trim() || !addForm.last_name.trim()}
                  className="flex-1 py-2.5 bg-[#B8832A] hover:bg-[#b8852e] disabled:opacity-40 text-[#0D1B2A] rounded-lg text-sm font-semibold transition-colors"
                >
                  {addSaving ? 'Saving...' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grace chat window */}
      {showGrace && (
        <div className="fixed top-[60px] right-6 z-50 w-[340px] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)] flex flex-col border border-white/10" style={{maxHeight: '65vh', background: 'linear-gradient(160deg, #16263a 0%, #0f1e2e 100%)'}}>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#B8832A] to-[#d4a043] flex items-center justify-center flex-shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[#0D1B2A]">
                <line x1="12" y1="2" x2="12" y2="22"/><line x1="5" y1="8" x2="19" y2="8"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-none">Grace</p>
              <p className="text-white/35 text-xs mt-0.5">AI Assistant</p>
            </div>
            <button onClick={closeGrace} className="ml-auto text-white/25 hover:text-white/70 transition-colors text-lg leading-none">×</button>
          </div>

          {/* Messages */}
          <div ref={graceChatRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {graceMessages.length === 0 && (
              <p className="text-white/25 text-sm text-center pt-6 leading-relaxed">Ask me anything about<br/>your visitors.</p>
            )}
            {graceMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'grace' && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#B8832A] to-[#d4a043] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[#0D1B2A]">
                      <line x1="12" y1="2" x2="12" y2="22"/><line x1="5" y1="8" x2="19" y2="8"/>
                    </svg>
                  </div>
                )}
                <div className={`max-w-[82%] text-sm ${msg.role === 'user'
                  ? 'bg-[#B8832A] text-[#0D1B2A] font-medium px-3.5 py-2.5 rounded-2xl rounded-tr-sm'
                  : 'text-white/85'}`}>
                  <p className={msg.role === 'grace' ? 'leading-relaxed' : ''}>{msg.text}</p>
                  {msg.ids && msg.ids.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {visitors.filter(v => msg.ids!.includes(v.id)).map(v => (
                        <button key={v.id} onClick={() => { setSelected(v); setShowGrace(false) }}
                          className="w-full text-left px-3 py-2 rounded-xl bg-white/8 hover:bg-white/14 border border-white/8 transition-all group">
                          <p className="text-white text-xs font-medium group-hover:text-[#B8832A] transition-colors">{v.name}</p>
                        </button>
                      ))}
                      <button
                        onClick={() => exportCSV(visitors.filter(v => msg.ids!.includes(v.id)), 'grace-results.csv')}
                        className="w-full text-center px-3 py-1.5 rounded-xl border border-[#B8832A]/30 text-[#B8832A] text-xs font-medium hover:bg-[#B8832A]/10 transition-all mt-1"
                      >
                        Download CSV
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {graceLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#B8832A] to-[#d4a043] flex items-center justify-center flex-shrink-0">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[#0D1B2A]">
                    <line x1="12" y1="2" x2="12" y2="22"/><line x1="5" y1="8" x2="19" y2="8"/>
                  </svg>
                </div>
                <div className="text-white/40 text-sm pt-0.5">Thinking...</div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-white/8">
            <div className="flex items-center gap-2 bg-white/6 rounded-xl px-3 py-2 border border-white/10 focus-within:border-[#B8832A]/50 transition-colors">
              <button
                onClick={toggleGraceVoice}
                className="flex-shrink-0 text-white/25 hover:text-white/50 transition-colors"
                title="Talk to Grace"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
              <input
                autoFocus
                value={graceQuery}
                onChange={e => setGraceQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && askGrace(graceQuery)}
                placeholder="Ask Grace..."
                className="flex-1 bg-transparent text-white placeholder-white/25 text-sm focus:outline-none"
              />
              <button
                onClick={() => askGrace(graceQuery)}
                disabled={graceLoading || !graceQuery.trim()}
                className="w-7 h-7 rounded-lg bg-[#B8832A] disabled:opacity-30 hover:bg-[#d4a043] transition-colors flex items-center justify-center flex-shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#0D1B2A]">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Hands-free voice view — takes over the window while a Grok voice call is live */}
          {graceVoice.active && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-6" style={{ background: 'radial-gradient(circle at 50% 42%, #16263a 0%, #0f1e2e 62%, #0a1622 100%)' }}>
              <button onClick={() => graceVoice.stop()} className="absolute top-3 right-4 text-white/30 hover:text-white/70 transition-colors text-xl leading-none">×</button>
              <div
                ref={graceVoice.orbRef}
                onClick={graceVoice.interrupt}
                className={`grace-orb${graceVoice.orbState ? ' ' + graceVoice.orbState : ''}`}
              >
                <span className="grace-orb-core" />
              </div>
              {(graceVoice.capUser || graceVoice.capBot) && (
                <div className="w-full max-w-[280px] text-center max-h-[28%] overflow-y-auto">
                  {graceVoice.capUser && <p className="text-white/45 text-sm italic mb-1.5">{graceVoice.capUser}</p>}
                  {graceVoice.capBot && <p className="text-white/90 text-[0.95rem] leading-relaxed">{graceVoice.capBot}</p>}
                </div>
              )}
              <button
                onClick={() => graceVoice.stop()}
                className="absolute bottom-5 px-4 py-1.5 rounded-full border border-white/15 text-white/60 text-xs hover:border-[#B8832A]/70 hover:text-white/90 transition-colors"
              >
                End voice
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

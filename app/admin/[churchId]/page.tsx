'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import type { Visitor, Church } from '@/types'
import VisitorDetail from './VisitorDetail'

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

  // Add contact form state
  const [addForm, setAddForm] = useState({
    name: '', email: '', phone: '', service_preference: '', how_heard: '',
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

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.name.trim()) { setAddError('Name is required'); return }
    setAddSaving(true)
    setAddError('')
    const res = await fetch('/api/visitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...addForm, church_id: churchId, skip_notifications: true }),
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
    setAddForm({ name: '', email: '', phone: '', service_preference: '', how_heard: '', prayer_request: '', is_returning: false })
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
            <span className="text-white/70"><span className="text-white font-medium">{visitors.length}</span> Total</span>
            <span className="text-white/70"><span className="text-white font-medium">{totalNew}</span> New</span>
            <span className="text-white/70"><span className="text-blue-300 font-medium">{totalReturning}</span> Returning</span>
            <span className="text-white/70"><span className="text-[#B8832A] font-medium">{withPrayer}</span> Prayer</span>
          </div>
          <div className="hidden md:block w-px h-5 bg-white/10" />
          <button
            onClick={() => setShowQR(true)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 border border-white/10 text-white/40 text-xs rounded-lg hover:border-white/20 hover:text-white/60 transition-colors"
          >
            QR Code
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — list */}
        <div className="flex flex-col w-full md:w-80 lg:w-96 border-r border-white/10 flex-shrink-0">

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
                <div className="w-9 h-9 rounded-full bg-[#B8832A] flex items-center justify-center text-[#0D1B2A] font-serif text-xs font-bold flex-shrink-0">
                  {visitor.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-white text-sm font-medium truncate">{visitor.name}</span>
                    {!visitor.is_returning && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full border border-white/30 text-white bg-white/10 leading-none">New</span>
                    )}
                    {visitor.prayer_request && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full border border-[#B8832A]/30 text-[#B8832A]/70 leading-none">✝</span>
                    )}
                  </div>
                  <p className="text-white/40 text-xs truncate mt-0.5">{visitor.email}</p>
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
          <div className="bg-white p-6 rounded-2xl shadow-2xl">
            <QRCodeSVG
              value={`${process.env.NEXT_PUBLIC_APP_URL}/visit/${churchId}`}
              size={260}
              bgColor="#ffffff"
              fgColor="#0D1B2A"
              level="M"
            />
          </div>

          <button
            onClick={() => window.print()}
            className="mt-6 px-6 py-2.5 border border-[#B8832A]/40 text-[#B8832A] text-sm rounded-lg hover:bg-[#B8832A]/10 transition-colors"
          >
            Print
          </button>
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
              <div>
                <label className="text-white/40 text-xs uppercase tracking-widest block mb-1.5">Name <span className="text-[#B8832A]">*</span></label>
                <input
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#B8832A] transition-colors"
                />
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
                      <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
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
                  disabled={addSaving || !addForm.name.trim()}
                  className="flex-1 py-2.5 bg-[#B8832A] hover:bg-[#b8852e] disabled:opacity-40 text-[#0D1B2A] rounded-lg text-sm font-semibold transition-colors"
                >
                  {addSaving ? 'Saving...' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

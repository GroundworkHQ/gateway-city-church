import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { naturalLanguageSearch } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const { query, churchId } = await req.json()
  if (!query || !churchId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: visitors } = await supabaseAdmin
    .from('church_visitors').select('*').eq('church_id', churchId)

  if (!visitors) return NextResponse.json({ error: 'Failed to load visitors' }, { status: 500 })

  const visitorIds = visitors.map((v: any) => v.id)

  const [
    { data: emails },
    { data: smsThreads },
    { data: allNotes },
    { data: allAttendance },
  ] = await Promise.all([
    supabaseAdmin.from('church_email_log').select('*').in('visitor_id', visitorIds),
    supabaseAdmin.from('church_sms_threads').select('*').eq('church_id', churchId),
    supabaseAdmin.from('church_visitor_notes').select('*').in('visitor_id', visitorIds),
    supabaseAdmin.from('church_attendance').select('*').in('visitor_id', visitorIds),
  ])

  // Get SMS threads for this church and their messages
  const threads = smsThreads ?? []
  const threadIds = threads.map((t: any) => t.id)
  const { data: allSms } = threadIds.length > 0
    ? await supabaseAdmin.from('church_sms_messages').select('*').in('thread_id', threadIds)
    : { data: [] }

  // Build rich profile per visitor
  const profiles = visitors.map((v: any) => {
    const vEmails = (emails ?? []).filter((e: any) => e.visitor_id === v.id)
    const vNotes = (allNotes ?? []).filter((n: any) => n.visitor_id === v.id)
    const vAttendance = (allAttendance ?? []).filter((a: any) => a.visitor_id === v.id)
    const vThread = threads.find((t: any) => t.visitor_id === v.id)
    const vSms = vThread ? (allSms ?? []).filter((s: any) => s.thread_id === vThread.id) : []
    const calls = vNotes.filter((n: any) => n.tag === 'connected-with-pastor')

    return {
      id: v.id,
      name: v.name,
      email: v.email ?? null,
      phone: v.phone ?? null,
      is_returning: v.is_returning,
      service: v.service_preference ?? null,
      how_heard: v.how_heard ?? null,
      prayer_request: v.prayer_request ?? null,
      first_visit: v.created_at.split('T')[0],
      total_visits: vAttendance.length,
      last_visit: vAttendance.length > 0 ? vAttendance.sort((a: any, b: any) => b.visited_at.localeCompare(a.visited_at))[0].visited_at.split('T')[0] : null,
      emails_sent: vEmails.map((e: any) => ({
        type: e.email_type,
        sent: e.sent_at.split('T')[0],
        opened: !!e.opened_at,
      })),
      sms: vSms.map((s: any) => ({
        direction: s.direction,
        body: s.body,
        date: s.sent_at.split('T')[0],
      })),
      calls_logged: calls.length,
      notes: vNotes.filter((n: any) => n.tag !== 'connected-with-pastor').map((n: any) => ({
        body: n.body,
        tag: n.tag ?? null,
        date: n.created_at.split('T')[0],
      })),
    }
  })

  const result = await naturalLanguageSearch(query, profiles)
  if (!result) return NextResponse.json({ error: 'Search failed' }, { status: 500 })

  return NextResponse.json(result)
}

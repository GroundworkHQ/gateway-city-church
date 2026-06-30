import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateVisitorInsight } from '@/lib/claude'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [{ data: visitor }, { data: attendance }, { data: thread }] = await Promise.all([
    supabaseAdmin.from('church_visitors').select('*, churches(name)').eq('id', id).single(),
    supabaseAdmin.from('church_attendance').select('id').eq('visitor_id', id),
    supabaseAdmin.from('church_sms_threads').select('id').eq('visitor_id', id).maybeSingle(),
  ])

  if (!visitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let recentSmsContext: string | undefined
  if (thread?.id) {
    const { data: msgs } = await supabaseAdmin
      .from('church_sms_messages')
      .select('direction, body')
      .eq('thread_id', thread.id)
      .order('sent_at', { ascending: false })
      .limit(4)
    if (msgs?.length) {
      recentSmsContext = msgs
        .reverse()
        .map(m => `${m.direction === 'inbound' ? visitor.name.split(' ')[0] : 'Pastor Danny'}: ${m.body}`)
        .join(' | ')
    }
  }

  const church = (visitor as any).churches
  const insight = await generateVisitorInsight(
    {
      name: visitor.name,
      prayerRequest: visitor.prayer_request,
      howHeard: visitor.how_heard,
      servicePreference: visitor.service_preference,
      isReturning: visitor.is_returning,
      churchName: church?.name ?? 'Gateway City Church',
      visitCount: attendance?.length ?? 0,
    },
    recentSmsContext
  )

  if (!insight) return NextResponse.json({ error: 'Failed to generate insight' }, { status: 500 })

  return NextResponse.json({ insight })
}

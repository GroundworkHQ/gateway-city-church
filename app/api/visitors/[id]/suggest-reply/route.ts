import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateSuggestedReply } from '@/lib/claude'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { channel, recentMessages } = await req.json()

  const { data: visitor } = await supabaseAdmin
    .from('church_visitors')
    .select('*, churches(name)')
    .eq('id', id)
    .single()

  if (!visitor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const church = (visitor as any).churches
  const suggestion = await generateSuggestedReply(
    {
      name: visitor.name,
      prayerRequest: visitor.prayer_request,
      howHeard: visitor.how_heard,
      servicePreference: visitor.service_preference,
      isReturning: visitor.is_returning,
      churchName: church?.name ?? 'Gateway City Church',
    },
    recentMessages ?? [],
    channel ?? 'sms'
  )

  if (!suggestion) return NextResponse.json({ error: 'Failed to generate suggestion' }, { status: 500 })

  return NextResponse.json({ suggestion: suggestion.body, subject: suggestion.subject ?? null })
}

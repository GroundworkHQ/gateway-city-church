import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSms } from '@/lib/telnyx'

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params
  const { body } = await req.json()

  if (!body?.trim()) {
    return NextResponse.json({ error: 'Message body required' }, { status: 400 })
  }

  // Get thread and visitor phone
  const { data: thread } = await supabaseAdmin
    .from('church_sms_threads')
    .select('id, visitor_id, church_visitors(phone, opted_out)')
    .eq('id', threadId)
    .single()

  if (!thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  const visitor = (thread as any).church_visitors
  if (!visitor?.phone) {
    return NextResponse.json({ error: 'No phone number on file' }, { status: 400 })
  }

  if (visitor.opted_out) {
    return NextResponse.json({ error: 'Visitor has opted out of SMS' }, { status: 400 })
  }

  // Send SMS via Telnyx
  const result = await sendSms(visitor.phone, body)

  // Save to thread
  await supabaseAdmin.from('church_sms_messages').insert({
    thread_id: threadId,
    direction: 'outbound',
    body,
    from_number: process.env.TELNYX_PHONE_NUMBER,
    to_number: visitor.phone,
    telnyx_message_id: (result as any)?.data?.id ?? null,
  })

  return NextResponse.json({ success: true })
}

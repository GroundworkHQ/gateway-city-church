import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { analyzeUrgency } from '@/lib/claude'
import { sendSms } from '@/lib/telnyx'

export async function POST(req: NextRequest) {
  const payload = await req.json()

  // Telnyx wraps events in a data object
  const event = payload?.data
  if (event?.event_type !== 'message.received') {
    return NextResponse.json({ ok: true })
  }

  const from = event.payload?.from?.phone_number
  const body = event.payload?.text
  const telnyxMessageId = event.payload?.id

  if (!from || !body) {
    return NextResponse.json({ ok: true })
  }

  // Find visitor by phone number
  const { data: visitor } = await supabaseAdmin
    .from('church_visitors')
    .select('id, church_id, opted_out')
    .eq('phone', from)
    .maybeSingle()

  if (!visitor) {
    return NextResponse.json({ ok: true })
  }

  // Handle STOP opt-out
  if (body.trim().toUpperCase() === 'STOP') {
    await supabaseAdmin
      .from('church_visitors')
      .update({ opted_out: true })
      .eq('id', visitor.id)
    return NextResponse.json({ ok: true })
  }

  // Find or create SMS thread
  const { data: existingThread } = await supabaseAdmin
    .from('church_sms_threads')
    .select('id')
    .eq('visitor_id', visitor.id)
    .maybeSingle()

  let threadId = existingThread?.id
  if (!threadId) {
    const { data: newThread } = await supabaseAdmin
      .from('church_sms_threads')
      .insert({ visitor_id: visitor.id, church_id: visitor.church_id })
      .select('id')
      .single()
    threadId = newThread?.id
  }

  if (threadId) {
    await supabaseAdmin.from('church_sms_messages').insert({
      thread_id: threadId,
      direction: 'inbound',
      body,
      from_number: from,
      to_number: process.env.TELNYX_PHONE_NUMBER,
      telnyx_message_id: telnyxMessageId,
    })
  }

  // Check for urgent/crisis content and alert pastor
  const urgency = await analyzeUrgency(body).catch(() => null)
  if (urgency?.isUrgent && threadId) {
    const { data: visitorFull } = await supabaseAdmin
      .from('church_visitors')
      .select('name, churches(pastor_phone)')
      .eq('id', visitor.id)
      .single()

    // Create an urgent note on the visitor record
    await supabaseAdmin.from('church_visitor_notes').insert({
      visitor_id: visitor.id,
      body: `Urgent message flagged: "${body}"${urgency.reason ? ` — ${urgency.reason}` : ''}`,
      tag: 'urgent',
    })

    // Alert pastor via SMS if they have a phone on record
    const pastorPhone = (visitorFull as any)?.churches?.pastor_phone
    if (pastorPhone) {
      const firstName = (visitorFull?.name ?? 'A visitor').split(' ')[0]
      await sendSms(
        pastorPhone,
        `Urgent: ${firstName} sent a message that may need immediate attention. Check the admin panel.`
      ).catch(() => null)
    }
  }

  return NextResponse.json({ ok: true })
}

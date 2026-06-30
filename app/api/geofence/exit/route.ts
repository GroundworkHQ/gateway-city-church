import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSms } from '@/lib/telnyx'

export async function POST(req: NextRequest) {
  const { visitor_id, church_id } = await req.json()

  if (!visitor_id || !church_id) {
    return NextResponse.json({ error: 'Missing visitor_id or church_id' }, { status: 400 })
  }

  const [{ data: visitor }, { data: church }] = await Promise.all([
    supabaseAdmin.from('church_visitors').select('*').eq('id', visitor_id).single(),
    supabaseAdmin.from('churches').select('*').eq('id', church_id).single(),
  ])

  if (!visitor || !church) {
    return NextResponse.json({ error: 'Visitor or church not found' }, { status: 404 })
  }

  // Log geofence event
  await supabaseAdmin.from('church_geofence_events').insert({
    visitor_id,
    church_id,
    event_type: 'exit',
    timestamp: new Date().toISOString(),
  })

  // Send thank you SMS
  if (visitor.phone && !visitor.opted_out) {
    const firstName = visitor.name.split(' ')[0]
    await sendSms(
      visitor.phone,
      `Hey ${firstName}! Thank you for joining us at Gateway City Church today. It was great having you with us. If you have any questions or just want to connect, reply to this message. We would love to hear from you. See you next Sunday! Pastor Danny & the Gateway City Church Family`
    )

    // Ensure SMS thread exists
    const { data: existingThread } = await supabaseAdmin
      .from('church_sms_threads')
      .select('id')
      .eq('visitor_id', visitor_id)
      .maybeSingle()

    let threadId = existingThread?.id
    if (!threadId) {
      const { data: newThread } = await supabaseAdmin
        .from('church_sms_threads')
        .insert({ visitor_id, church_id })
        .select('id')
        .single()
      threadId = newThread?.id
    }

    if (threadId) {
      await supabaseAdmin.from('church_sms_messages').insert({
        thread_id: threadId,
        direction: 'outbound',
        body: `Hey ${firstName}! Thank you for joining us at Gateway City Church today. It was great having you with us. If you have any questions or just want to connect, reply to this message. We would love to hear from you. See you next Sunday! Pastor Danny & the Gateway City Church Family`,
        from_number: process.env.TELNYX_PHONE_NUMBER,
        to_number: visitor.phone,
      })
    }
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resend, FROM } from '@/lib/resend'
import { followUp2Email, followUp3Email } from '@/lib/emails'
import { sendSms } from '@/lib/telnyx'
import { generateFollowUp } from '@/lib/claude'

async function ensureThreadAndLog(visitorId: string, churchId: string, phone: string, body: string) {
  const { data: existingThread } = await supabaseAdmin
    .from('church_sms_threads')
    .select('id')
    .eq('visitor_id', visitorId)
    .maybeSingle()

  let threadId = existingThread?.id
  if (!threadId) {
    const { data: newThread } = await supabaseAdmin
      .from('church_sms_threads')
      .insert({ visitor_id: visitorId, church_id: churchId })
      .select('id')
      .single()
    threadId = newThread?.id
  }

  if (threadId) {
    await supabaseAdmin.from('church_sms_messages').insert({
      thread_id: threadId,
      direction: 'outbound',
      body,
      from_number: process.env.TELNYX_PHONE_NUMBER,
      to_number: phone,
    })
  }
}

// Vercel Cron — runs daily at 9am
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const day3Cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const day6Cutoff = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
  const day4Cutoff = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString()
  const day7Cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: due2 } = await supabaseAdmin
    .from('church_visitors')
    .select('id, name, email, phone, prayer_request, how_heard, service_preference, is_returning, church_id, churches(name, address)')
    .not('email_1_sent_at', 'is', null)
    .is('email_2_sent_at', null)
    .eq('opted_out', false)
    .lt('email_1_sent_at', day3Cutoff)
    .gt('email_1_sent_at', day4Cutoff)

  const { data: due3 } = await supabaseAdmin
    .from('church_visitors')
    .select('id, name, email, phone, prayer_request, how_heard, service_preference, is_returning, church_id, churches(name, address)')
    .not('email_2_sent_at', 'is', null)
    .is('email_3_sent_at', null)
    .eq('opted_out', false)
    .lt('email_1_sent_at', day6Cutoff)
    .gt('email_1_sent_at', day7Cutoff)

  let sent2 = 0, sent3 = 0

  for (const visitor of due2 ?? []) {
    const church = (visitor as any).churches
    const churchName = church?.name ?? 'Gateway City Church'
    const firstName = visitor.name.split(' ')[0]

    const ai = await generateFollowUp(2, {
      name: visitor.name,
      prayerRequest: visitor.prayer_request,
      howHeard: visitor.how_heard,
      servicePreference: visitor.service_preference,
      isReturning: visitor.is_returning,
      churchName,
    })

    if (visitor.email) {
      const html = followUp2Email(visitor.name, churchName, church?.address ?? '', ai?.emailParagraphs)
      const { data: emailData } = await resend.emails.send({
        from: FROM,
        to: visitor.email,
        subject: `Still thinking about you, ${firstName}`,
        html,
      })
      await supabaseAdmin.from('church_email_log').insert({
        visitor_id: visitor.id,
        email_type: 'followup_2',
        resend_email_id: emailData?.id ?? null,
      })
    }

    if (visitor.phone) {
      const fallbackSms = `Hey ${firstName}! It was great having you at Gateway City Church on Sunday. Just wanted to check in and hope to see you again soon! Pastor Danny & the Gateway City Church Family`
      const smsBody = ai ? `${ai.smsBody} Pastor Danny & the ${churchName} Family` : fallbackSms
      await sendSms(visitor.phone, smsBody)
      await ensureThreadAndLog(visitor.id, visitor.church_id, visitor.phone, smsBody)
    }

    await supabaseAdmin
      .from('church_visitors')
      .update({ email_2_sent_at: new Date().toISOString() })
      .eq('id', visitor.id)
    sent2++
  }

  for (const visitor of due3 ?? []) {
    const church = (visitor as any).churches
    const churchName = church?.name ?? 'Gateway City Church'
    const firstName = visitor.name.split(' ')[0]

    const ai = await generateFollowUp(3, {
      name: visitor.name,
      prayerRequest: visitor.prayer_request,
      howHeard: visitor.how_heard,
      servicePreference: visitor.service_preference,
      isReturning: visitor.is_returning,
      churchName,
    })

    if (visitor.email) {
      const html = followUp3Email(visitor.name, churchName, church?.address ?? '', ai?.emailParagraphs)
      const { data: emailData } = await resend.emails.send({
        from: FROM,
        to: visitor.email,
        subject: `See you tomorrow, ${firstName}?`,
        html,
      })
      await supabaseAdmin.from('church_email_log').insert({
        visitor_id: visitor.id,
        email_type: 'followup_3',
        resend_email_id: emailData?.id ?? null,
      })
    }

    if (visitor.phone) {
      const fallbackSms = `Hey ${firstName}! Tomorrow is Sunday and we'd love to see you back at Gateway City Church. Service starts at 10:00 AM. Come as you are! Pastor Danny & the ${churchName} Family`
      const smsBody = ai ? `${ai.smsBody} Pastor Danny & the ${churchName} Family` : fallbackSms
      await sendSms(visitor.phone, smsBody)
      await ensureThreadAndLog(visitor.id, visitor.church_id, visitor.phone, smsBody)
    }

    await supabaseAdmin
      .from('church_visitors')
      .update({ email_3_sent_at: new Date().toISOString() })
      .eq('id', visitor.id)
    sent3++
  }

  return NextResponse.json({ success: true, sent2, sent3 })
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resend, FROM } from '@/lib/resend'
import { sendSms } from '@/lib/telnyx'
import { welcomeEmail } from '@/lib/emails'
import { generateWelcomeEmail } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { church_id, name, phone, email, how_heard, prayer_request, service_preference, is_returning: manualIsReturning, skip_notifications } = body

  if (!church_id || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fetch church details
  const { data: church } = await supabaseAdmin
    .from('churches')
    .select('*')
    .eq('id', church_id)
    .single()

  if (!church) {
    return NextResponse.json({ error: 'Church not found' }, { status: 404 })
  }

  // Check for existing visitor (dedup by email or phone)
  const orClause = [email ? `email.eq.${email}` : null, phone ? `phone.eq.${phone}` : null].filter(Boolean).join(',')
  const { data: existing } = orClause ? await supabaseAdmin
    .from('church_visitors')
    .select('id, is_returning')
    .eq('church_id', church_id)
    .or(orClause)
    .maybeSingle() : { data: null }

  let visitorId: string

  if (existing) {
    visitorId = existing.id
    await supabaseAdmin
      .from('church_visitors')
      .update({ is_returning: true, phone, how_heard, prayer_request, service_preference })
      .eq('id', visitorId)
  } else {
    const { data: newVisitor, error } = await supabaseAdmin
      .from('church_visitors')
      .insert({
        church_id, name, phone: phone || null, email: email || null,
        how_heard: how_heard || null, prayer_request: prayer_request || null,
        service_preference: service_preference || null,
        is_returning: manualIsReturning ?? false,
      })
      .select('id')
      .single()

    if (error || !newVisitor) {
      return NextResponse.json({ error: 'Failed to save visitor' }, { status: 500 })
    }
    visitorId = newVisitor.id
  }

  // Log attendance (skip for manual adds — no visit actually happened)
  if (!skip_notifications) {
    await supabaseAdmin
      .from('church_attendance')
      .insert({ visitor_id: visitorId, church_id, service_type: service_preference, visited_at: new Date().toISOString() })
  }

  // Send welcome email (new visitors from kiosk only)
  if (!existing && !skip_notifications && email) {
    const aiBody = await generateWelcomeEmail({
      name,
      prayerRequest: prayer_request ?? null,
      howHeard: how_heard ?? null,
      servicePreference: service_preference ?? null,
      isReturning: false,
      churchName: church.name,
    }).catch(() => null)
    const html = welcomeEmail(name, church.name, church.address || '', aiBody ?? undefined)
    const { data: emailData } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: `Welcome to ${church.name}, ${name.split(' ')[0]}!`,
      html,
    })

    await supabaseAdmin.from('church_email_log').insert({
      visitor_id: visitorId,
      email_type: 'welcome_1',
      resend_email_id: emailData?.id ?? null,
    })

    await supabaseAdmin
      .from('church_visitors')
      .update({ email_1_sent_at: new Date().toISOString() })
      .eq('id', visitorId)
  }

  // Notify pastor (kiosk flow only)
  if (!existing && !skip_notifications && church.pastor_phone) {
    const howHeardLabels: Record<string, string> = {
      friend: 'a friend',
      social_media: 'social media',
      google: 'Google',
      drove_by: 'driving by',
      other: 'word of mouth',
    }
    const howLine = how_heard ? ` Found us through ${howHeardLabels[how_heard] ?? how_heard}.` : ''
    const serviceLine = service_preference ? ` Attended the ${service_preference} service.` : ''
    const prayerLine = prayer_request ? `\nPrayer request: "${prayer_request}"` : ''
    await sendSms(
      church.pastor_phone,
      `${name} just checked in for the first time.${howLine}${serviceLine}${prayerLine}`
    )
  }

  const { data: visitor } = await supabaseAdmin
    .from('church_visitors')
    .select('*')
    .eq('id', visitorId)
    .single()

  return NextResponse.json({ success: true, visitor_id: visitorId, is_returning: !!existing, visitor })
}

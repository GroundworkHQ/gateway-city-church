import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateFollowUp } from '@/lib/claude'
import { welcomeEmail, followUp2Email, followUp3Email } from '@/lib/emails'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const visitorId = searchParams.get('visitor_id')
  const followUpParam = searchParams.get('follow_up') ?? '2'
  const followUpNum = followUpParam === '1' ? 1 : followUpParam === '3' ? 3 : 2

  if (!visitorId) {
    return NextResponse.json({ error: 'visitor_id required' }, { status: 400 })
  }

  const { data: visitor } = await supabaseAdmin
    .from('church_visitors')
    .select('*, churches(name, address)')
    .eq('id', visitorId)
    .single()

  if (!visitor) {
    return NextResponse.json({ error: 'Visitor not found' }, { status: 404 })
  }

  const church = (visitor as any).churches
  const churchName = church?.name ?? 'Gateway City Church'

  if (followUpNum === 1) {
    return NextResponse.json({
      visitor: { name: visitor.name, email: visitor.email },
      follow_up: 1,
      ai_generated: false,
      email_html: welcomeEmail(visitor.name, churchName, church?.address ?? ''),
    })
  }

  const ai = await generateFollowUp(followUpNum as 2 | 3, {
    name: visitor.name,
    prayerRequest: visitor.prayer_request,
    howHeard: visitor.how_heard,
    servicePreference: visitor.service_preference,
    isReturning: visitor.is_returning,
    churchName,
  })

  const emailHtml = followUpNum === 2
    ? followUp2Email(visitor.name, churchName, church?.address ?? '', ai?.emailParagraphs)
    : followUp3Email(visitor.name, churchName, church?.address ?? '', ai?.emailParagraphs)

  return NextResponse.json({
    visitor: { name: visitor.name, email: visitor.email, phone: visitor.phone, prayer_request: visitor.prayer_request },
    follow_up: followUpNum,
    ai_generated: !!ai,
    sms_preview: ai ? `${ai.smsBody} Pastor Danny & the ${churchName} Family` : null,
    email_html: emailHtml,
  })
}

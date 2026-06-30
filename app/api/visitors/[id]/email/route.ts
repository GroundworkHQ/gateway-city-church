import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resend, FROM } from '@/lib/resend'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { subject, body } = await req.json()

  if (!subject || !body) {
    return NextResponse.json({ error: 'subject and body are required' }, { status: 400 })
  }

  const { data: visitor } = await supabaseAdmin
    .from('church_visitors')
    .select('email, name')
    .eq('id', id)
    .single()

  if (!visitor?.email) {
    return NextResponse.json({ error: 'Visitor has no email' }, { status: 400 })
  }

  const { data: emailData, error } = await resend.emails.send({
    from: FROM,
    to: visitor.email,
    subject,
    html: `<div style="font-family:Georgia,serif;max-width:560px;margin:40px auto;background:#0D1B2A;border-radius:8px;overflow:hidden;">
      <div style="padding:28px 36px;border-bottom:1px solid rgba(201,150,58,0.2);text-align:center;">
        <div style="font-size:24px;color:#B8832A;">✝</div>
        <p style="color:#B8832A;font-size:18px;margin:4px 0;">Gateway City Church</p>
      </div>
      <div style="padding:32px 36px;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.8;">
        ${body.split('\n').map((line: string) => `<p style="margin:0 0 16px;">${line}</p>`).join('')}
      </div>
      <div style="padding:16px 36px;text-align:center;font-size:11px;color:rgba(255,255,255,0.25);border-top:1px solid rgba(255,255,255,0.05);">
        Gateway City Church &bull; 3630 N Rancho Dr #112, Las Vegas, NV 89130
      </div>
    </div>`,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: log } = await supabaseAdmin
    .from('church_email_log')
    .insert({
      visitor_id: id,
      email_type: 'manual',
      subject,
      body,
      direction: 'outbound',
      resend_email_id: emailData?.id ?? null,
    })
    .select()
    .single()

  return NextResponse.json(log)
}

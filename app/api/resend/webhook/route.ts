import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const payload = await req.json()

  if (payload.type === 'email.opened') {
    const emailId = payload.data?.email_id
    if (emailId) {
      await supabaseAdmin
        .from('church_email_log')
        .update({ opened_at: new Date().toISOString() })
        .eq('resend_email_id', emailId)
        .is('opened_at', null)
    }
  }

  return NextResponse.json({ ok: true })
}

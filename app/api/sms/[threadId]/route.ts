import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params

  const { data: messages, error } = await supabaseAdmin
    .from('church_sms_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(messages)
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { church_id, service_type } = await req.json()

  const { data: visitor } = await supabaseAdmin
    .from('church_visitors')
    .select('id, church_id')
    .eq('id', id)
    .single()

  if (!visitor) {
    return NextResponse.json({ error: 'Visitor not found' }, { status: 404 })
  }

  await supabaseAdmin.from('church_attendance').insert({
    visitor_id: id,
    church_id: church_id ?? visitor.church_id,
    service_type: service_type ?? null,
    visited_at: new Date().toISOString(),
  })

  await supabaseAdmin
    .from('church_visitors')
    .update({ is_returning: true })
    .eq('id', id)

  return NextResponse.json({ success: true })
}

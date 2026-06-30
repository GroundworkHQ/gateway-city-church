import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; attendanceId: string }> }) {
  const { attendanceId } = await params
  const { error } = await supabaseAdmin
    .from('church_attendance')
    .delete()
    .eq('id', attendanceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

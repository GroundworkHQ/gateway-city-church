import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { body, tag } = await req.json()

  if (!body?.trim()) {
    return NextResponse.json({ error: 'Note body required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('church_visitor_notes')
    .insert({ visitor_id: id, body, tag: tag ?? null })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('church_visitor_notes')
    .select('*')
    .eq('visitor_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

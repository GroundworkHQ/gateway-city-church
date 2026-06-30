import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { visitor_id, church_id } = await req.json()

  if (!visitor_id || !church_id) {
    return NextResponse.json({ error: 'Missing visitor_id or church_id' }, { status: 400 })
  }

  // Log geofence event
  await supabaseAdmin.from('church_geofence_events').insert({
    visitor_id,
    church_id,
    event_type: 'enter',
    timestamp: new Date().toISOString(),
  })

  return NextResponse.json({ success: true })
}

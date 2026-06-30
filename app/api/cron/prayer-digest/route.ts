import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resend, FROM } from '@/lib/resend'
import { generatePrayerDigest } from '@/lib/claude'

// Vercel Cron — runs every Monday at 8am
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: churches } = await supabaseAdmin.from('churches').select('*')
  if (!churches?.length) return NextResponse.json({ sent: 0 })

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  let sent = 0

  for (const church of churches) {
    const pastorEmail = church.pastor_email ?? process.env.PASTOR_EMAIL
    if (!pastorEmail) continue

    const { data: visitors } = await supabaseAdmin
      .from('church_visitors')
      .select('name, prayer_request, created_at, how_heard')
      .eq('church_id', church.id)
      .not('prayer_request', 'is', null)
      .gt('created_at', weekAgo)
      .order('created_at', { ascending: false })

    if (!visitors?.length) continue

    const digest = await generatePrayerDigest(
      visitors as Array<{ name: string; prayer_request: string; created_at: string; how_heard?: string | null }>,
      church.name
    )

    const bodyText = digest ?? visitors
      .map(v => `• ${v.name}: "${v.prayer_request}"`)
      .join('\n')

    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; padding: 0; background: #f4f1ea; font-family: Georgia, serif; }
  .wrap { max-width: 560px; margin: 48px auto; background: #fff; border-radius: 4px; overflow: hidden; }
  .header { background: #0D1B2A; padding: 24px 40px; text-align: center; }
  .cross { font-size: 20px; color: #B8832A; margin-bottom: 4px; }
  .church-name { color: #B8832A; font-size: 15px; margin: 0; letter-spacing: 0.06em; }
  .body { padding: 40px 40px 32px; color: #2C2C2A; font-size: 15px; line-height: 1.8; }
  .week { color: #999; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 20px; }
  .summary { white-space: pre-wrap; }
  .footer { padding: 20px 40px; text-align: center; font-size: 11px; color: #bbb; border-top: 1px solid #f0ece3; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="cross">✝</div>
    <p class="church-name">${church.name.toUpperCase()}</p>
  </div>
  <div class="body">
    <p class="week">Weekly Prayer Digest — ${visitors.length} request${visitors.length !== 1 ? 's' : ''} this week</p>
    <div class="summary">${bodyText.replace(/\n/g, '<br>')}</div>
  </div>
  <div class="footer">${church.name} &bull; ${church.address ?? ''}</div>
</div>
</body>
</html>`

    await resend.emails.send({
      from: FROM,
      to: pastorEmail,
      subject: `Prayer Digest — ${visitors.length} request${visitors.length !== 1 ? 's' : ''} this week`,
      html,
    })
    sent++
  }

  return NextResponse.json({ sent })
}

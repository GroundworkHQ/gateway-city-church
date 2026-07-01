import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface VisitorContext {
  name: string
  prayerRequest?: string | null
  howHeard?: string | null
  servicePreference?: string | null
  isReturning?: boolean
  churchName: string
}

interface FollowUpContent {
  emailParagraphs: string // 2-3 <p> tags to inject into email template
  smsBody: string         // plain text SMS, under 300 chars
}

const HOW_HEARD_LABELS: Record<string, string> = {
  friend: 'a friend or family member',
  social_media: 'social media',
  google: 'a Google search',
  drove_by: 'driving by',
  other: 'word of mouth',
}

function visitorContextLines(visitor: VisitorContext): string {
  const firstName = visitor.name.split(' ')[0]
  const howHeard = visitor.howHeard ? HOW_HEARD_LABELS[visitor.howHeard] ?? visitor.howHeard : null
  const service = visitor.servicePreference === 'spanish' ? 'Spanish' : 'English'
  return [
    `Visitor first name: ${firstName}`,
    visitor.isReturning ? 'This is a returning visitor (has been before).' : 'This is a first-time visitor.',
    howHeard ? `They found the church through ${howHeard}.` : null,
    `They attended the ${service} service.`,
    visitor.prayerRequest ? `They shared this prayer request: "${visitor.prayerRequest}"` : 'They did not share a prayer request.',
  ].filter(Boolean).join('\n')
}

async function callClaude(prompt: string, maxTokens = 512): Promise<string | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : null
    return text?.replace(/—/g, '-') ?? null
  } catch {
    return null
  }
}

// ─── Follow-up emails 2 & 3 ─────────────────────────────────────────────────

function buildFollowUpPrompt(followUpNumber: 2 | 3, visitor: VisitorContext): string {
  const firstName = visitor.name.split(' ')[0]
  const context = visitorContextLines(visitor)

  if (followUpNumber === 2) {
    return `You are Pastor Danny at Gateway City Church in Las Vegas. Write a warm, personal follow-up to a visitor who came to church 3 days ago. This should feel like a genuine personal message, not a mass email. Do not use em dashes (— or --).

Visitor context:
${context}

Write TWO versions:

1. EMAIL BODY: 2-3 short paragraphs in plain HTML <p> tags. Warm and personal. If they shared a prayer request, acknowledge it specifically and warmly — don't be generic. End by inviting them back. Sign off is handled separately, do not include it. Keep it under 100 words total.

2. SMS: A single conversational text message under 160 characters. Warm, casual. If they had a prayer request, briefly acknowledge it. Do NOT include a sign-off or "Pastor Danny" — that's added separately.

Respond in this exact JSON format:
{"emailParagraphs": "<p>...</p><p>...</p>", "smsBody": "..."}`
  }

  return `You are Pastor Danny at Gateway City Church in Las Vegas. Write a warm, personal Sunday invitation to ${firstName} who visited 6 days ago. Tomorrow is Sunday and you want them to come back. This should feel genuinely personal. Do not use em dashes (— or --).

Visitor context:
${context}

Write TWO versions:

1. EMAIL BODY: 2-3 short paragraphs in plain HTML <p> tags. Reference something specific about their visit or prayer request if they had one. End with a clear, warm invitation to come back tomorrow. Sign off is handled separately, do not include it. Keep it under 100 words total.

2. SMS: A single conversational text message under 160 characters. Warm, Sunday-invite energy. If they had a prayer request, acknowledge it briefly. Do NOT include a sign-off — that's added separately.

Respond in this exact JSON format:
{"emailParagraphs": "<p>...</p><p>...</p>", "smsBody": "..."}`
}

export async function generateFollowUp(
  followUpNumber: 2 | 3,
  visitor: VisitorContext
): Promise<FollowUpContent | null> {
  try {
    const text = await callClaude(buildFollowUpPrompt(followUpNumber, visitor))
    if (!text) return null
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.emailParagraphs || !parsed.smsBody) return null
    return parsed as FollowUpContent
  } catch {
    return null
  }
}

// ─── Welcome email personalization (email 1) ────────────────────────────────

export async function generateWelcomeEmail(visitor: VisitorContext): Promise<string | null> {
  const firstName = visitor.name.split(' ')[0]
  const context = visitorContextLines(visitor)

  const prompt = `You are Pastor Danny at Gateway City Church in Las Vegas. Write a warm, personal welcome email to someone who just attended church for the first time today. Do not use em dashes (— or --).

Visitor context:
${context}

Write the EMAIL BODY: 2-3 short paragraphs in plain HTML <p> tags. Warm and genuine. If they shared a prayer request, acknowledge it specifically — don't be generic or preachy. Let them know someone from the team will personally reach out if they reply. End warmly. Sign off is handled separately, do not include it. Keep it under 120 words total. Address them as ${firstName}.

Respond with ONLY the HTML paragraphs, no JSON, no extra text.`

  try {
    const text = await callClaude(prompt)
    if (!text) return null
    // Extract just the <p> tags
    const pTags = text.match(/<p[\s\S]*?<\/p>/g)
    if (!pTags) return null
    return pTags.join('')
  } catch {
    return null
  }
}

// ─── AI reply suggestion ─────────────────────────────────────────────────────

export async function generateSuggestedReply(
  visitor: VisitorContext,
  recentMessages: Array<{ direction: 'inbound' | 'outbound'; body: string }>,
  channel: 'sms' | 'email'
): Promise<{ body: string; subject?: string } | null> {
  const firstName = visitor.name.split(' ')[0]
  const context = visitorContextLines(visitor)
  const thread = recentMessages
    .slice(-6)
    .map(m => `${m.direction === 'inbound' ? firstName : 'Pastor Danny'}: ${m.body}`)
    .join('\n')

  const prompt = channel === 'sms'
    ? `You are Pastor Danny at Gateway City Church in Las Vegas. Draft a reply to this visitor. Do not use em dashes (— or --).

Visitor context:
${context}

Recent conversation:
${thread || '(No prior messages)'}

Write a short casual SMS reply (under 160 characters, no sign-off — it's added automatically).

Respond with ONLY the message text, nothing else.`
    : `You are Pastor Danny at Gateway City Church in Las Vegas. Draft an email reply to this visitor. Do not use em dashes (— or --).

Visitor context:
${context}

Recent conversation:
${thread || '(No prior messages)'}

Write a warm, personal email (2-3 sentences, conversational, no sign-off). Also write a concise subject line (under 8 words, natural not generic).

Respond in this exact JSON format:
{"subject": "...", "body": "..."}`

  const text = await callClaude(prompt, 256)
  if (!text) return null

  if (channel === 'sms') {
    return { body: text.trim() }
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { body: text.trim() }
    const parsed = JSON.parse(jsonMatch[0])
    return { body: parsed.body ?? text.trim(), subject: parsed.subject }
  } catch {
    return { body: text.trim() }
  }
}

// ─── Visitor insight card ────────────────────────────────────────────────────

export async function generateVisitorInsight(
  visitor: VisitorContext & { visitCount: number },
  recentSmsContext?: string
): Promise<string | null> {
  const context = visitorContextLines(visitor)

  const prompt = `You are a ministry assistant helping Pastor Danny understand a visitor at Gateway City Church. Based on the profile below, write a 2-3 sentence pastoral snapshot: who this person seems to be, what might matter to them spiritually, and a suggested approach for outreach. Be warm and insightful, not clinical. Do not use em dashes (-- or —) in your response.

Visitor profile:
${context}
Total visits: ${visitor.visitCount}
${recentSmsContext ? `Recent SMS exchange context: ${recentSmsContext}` : ''}

Respond with ONLY the 2-3 sentence snapshot, nothing else.`

  const text = await callClaude(prompt, 256)
  return text?.trim().replace(/—/g, '-').replace(/--/g, '-') ?? null
}

// ─── Prayer request digest ───────────────────────────────────────────────────

export async function generatePrayerDigest(
  visitors: Array<{ name: string; prayer_request: string; created_at: string; how_heard?: string | null }>,
  churchName: string
): Promise<string | null> {
  if (visitors.length === 0) return null

  const list = visitors
    .map(v => `- ${v.name} (visited ${new Date(v.created_at).toLocaleDateString()}): "${v.prayer_request}"`)
    .join('\n')

  const prompt = `You are a ministry assistant helping Pastor Danny at ${churchName} prepare for his week. Below are prayer requests from visitors this week. Write a brief, organized pastoral summary he can use to pray over and follow up on. Group by urgency or theme if patterns emerge. Keep it under 250 words. Warm, pastoral tone. Do not use em dashes (— or --).

Prayer requests:
${list}

Respond with ONLY the summary text (plain text, no HTML).`

  const text = await callClaude(prompt, 512)
  return text?.trim() ?? null
}

// ─── Grace: natural language visitor search ──────────────────────────────────

export async function naturalLanguageSearch(
  query: string,
  visitors: any[]
): Promise<{ ids: string[]; explanation: string } | null> {
  const prompt = `You are Grace, an AI assistant for Gateway City Church in Las Vegas. You serve the pastoral staff and have two areas of knowledge:

1. VISITOR DATA: You have access to all visitor records for this church.
2. BIBLE KNOWLEDGE: You have complete knowledge of the entire Bible - all 66 books, Old and New Testament. You know every story, passage, character, teaching, and theological theme. You can quote scripture, explain context, suggest verses for pastoral situations, compare passages, and answer questions about biblical content.

A staff member asked: "${query}"

If this is a question about the Bible, scripture, a specific passage, a biblical character, a theological topic, or anything related to God's Word - answer it directly and thoroughly in the explanation field, and return an empty ids array.

If this is a question about visitors - search the visitor data and return matching IDs with a SHORT plain English response (1-2 sentences max). Write like you're talking to a pastor, never mention field names, JSON keys, or technical terms.

If this is a Bible or theological question - answer concisely in 2-3 sentences max. Be warm and pastoral, not academic.

Visitor data:
${JSON.stringify(visitors, null, 1)}

Do not use em dashes. Respond in this exact JSON format:
{"ids": ["id1", "id2"], "explanation": "..."}`

  try {
    const text = await callClaude(prompt, 2048)
    if (!text) return null
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed.ids)) return null
    return parsed as { ids: string[]; explanation: string }
  } catch {
    return null
  }
}

// ─── Urgency detection for inbound SMS ──────────────────────────────────────

export async function analyzeUrgency(messageBody: string): Promise<{ isUrgent: boolean; reason: string } | null> {
  const prompt = `You are reviewing an inbound SMS from a church visitor. Determine if this message indicates a crisis, urgent need, or situation that requires immediate pastoral attention (e.g. grief, mental health crisis, domestic situation, medical emergency, suicidal ideation, spiritual crisis that needs same-day response).

Message: "${messageBody}"

Respond in this exact JSON format:
{"isUrgent": true/false, "reason": "brief explanation or empty string if not urgent"}`

  try {
    const text = await callClaude(prompt, 128)
    if (!text) return null
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (typeof parsed.isUrgent !== 'boolean') return null
    return parsed as { isUrgent: boolean; reason: string }
  } catch {
    return null
  }
}

import { Telnyx } from 'telnyx'

export const telnyx = new Telnyx({ apiKey: process.env.TELNYX_API_KEY! })

export const CHURCH_PHONE = process.env.TELNYX_PHONE_NUMBER!

export async function sendSms(to: string, body: string) {
  return telnyx.messages.send({
    from: CHURCH_PHONE,
    to,
    text: body,
  })
}

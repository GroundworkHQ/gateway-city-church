export type Church = {
  id: string
  name: string
  address: string | null
  service_start_time: string | null
  service_duration_hours: number
  pastor_name: string | null
  pastor_phone: string | null
  pastor_email: string | null
  created_at: string
}

export type Visitor = {
  id: string
  church_id: string
  name: string
  phone: string | null
  email: string | null
  how_heard: string | null
  prayer_request: string | null
  service_preference: 'english' | 'spanish' | null
  is_returning: boolean
  email_1_sent_at: string | null
  email_2_sent_at: string | null
  email_3_sent_at: string | null
  opted_out: boolean
  created_at: string
  last_activity_at: string
}

export type Attendance = {
  id: string
  visitor_id: string
  church_id: string
  service_type: string | null
  visited_at: string
}

export type GeofenceEvent = {
  id: string
  visitor_id: string
  church_id: string
  event_type: 'enter' | 'exit'
  timestamp: string
}

export type EmailLog = {
  id: string
  visitor_id: string
  email_type: 'welcome_1' | 'followup_2' | 'followup_3' | 'manual'
  subject: string | null
  body: string | null
  direction: 'inbound' | 'outbound'
  sent_at: string
  opened_at: string | null
  resend_email_id: string | null
}

export type SmsThread = {
  id: string
  visitor_id: string
  church_id: string
  created_at: string
}

export type SmsMessage = {
  id: string
  thread_id: string
  direction: 'inbound' | 'outbound'
  body: string
  from_number: string | null
  to_number: string | null
  telnyx_message_id: string | null
  sent_at: string
}

export type VisitorNote = {
  id: string
  visitor_id: string
  body: string
  tag: string | null
  created_at: string
}

export type VisitorTag =
  | 'first-time'
  | 'needs-follow-up'
  | 'connected-with-pastor'
  | 'prayer-request'
  | 'new-believer'
  | 'volunteer-interest'

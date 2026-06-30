-- Churches
create table if not exists churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  service_start_time time,
  service_duration_hours int default 2,
  pastor_name text,
  pastor_phone text,
  pastor_email text,
  created_at timestamptz default now()
);

-- Visitors
create table if not exists church_visitors (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references churches(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  how_heard text,
  prayer_request text,
  service_preference text,
  is_returning boolean default false,
  email_1_sent_at timestamptz,
  email_2_sent_at timestamptz,
  email_3_sent_at timestamptz,
  opted_out boolean default false,
  created_at timestamptz default now()
);

-- Attendance
create table if not exists church_attendance (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid references church_visitors(id) on delete cascade,
  church_id uuid references churches(id) on delete cascade,
  service_type text,
  visited_at timestamptz default now()
);

-- Geofence events
create table if not exists church_geofence_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid references church_visitors(id) on delete cascade,
  church_id uuid references churches(id) on delete cascade,
  event_type text not null check (event_type in ('enter', 'exit')),
  timestamp timestamptz default now()
);

-- Email log
create table if not exists church_email_log (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid references church_visitors(id) on delete cascade,
  email_type text not null check (email_type in ('welcome_1', 'followup_2', 'followup_3')),
  sent_at timestamptz default now(),
  opened_at timestamptz,
  resend_email_id text
);

-- SMS threads
create table if not exists church_sms_threads (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid references church_visitors(id) on delete cascade,
  church_id uuid references churches(id) on delete cascade,
  created_at timestamptz default now()
);

-- SMS messages
create table if not exists church_sms_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references church_sms_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  from_number text,
  to_number text,
  telnyx_message_id text,
  sent_at timestamptz default now()
);

-- Visitor notes
create table if not exists church_visitor_notes (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid references church_visitors(id) on delete cascade,
  body text not null,
  tag text,
  created_at timestamptz default now()
);

-- RLS
alter table churches enable row level security;
alter table church_visitors enable row level security;
alter table church_attendance enable row level security;
alter table church_geofence_events enable row level security;
alter table church_email_log enable row level security;
alter table church_sms_threads enable row level security;
alter table church_sms_messages enable row level security;
alter table church_visitor_notes enable row level security;

-- Service role bypass (used by supabaseAdmin in API routes)
create policy "service role full access" on churches for all using (true);
create policy "service role full access" on church_visitors for all using (true);
create policy "service role full access" on church_attendance for all using (true);
create policy "service role full access" on church_geofence_events for all using (true);
create policy "service role full access" on church_email_log for all using (true);
create policy "service role full access" on church_sms_threads for all using (true);
create policy "service role full access" on church_sms_messages for all using (true);
create policy "service role full access" on church_visitor_notes for all using (true);

-- Seed Gateway City Church
insert into churches (name, address, service_start_time, service_duration_hours, pastor_name)
values (
  'Gateway City Church',
  '3630 N Rancho Dr #112, Las Vegas, NV 89130',
  '10:00',
  2,
  'Pastor Danny Hand'
) on conflict do nothing;

-- CampusPay schema for Supabase PostgreSQL
-- Run in Supabase SQL Editor as project owner.
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin','cashier');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transaction_kind as enum ('topup','payment','refund','adjustment');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'CampusPay user',
  role public.app_role not null default 'cashier',
  created_at timestamptz not null default now()
);
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_no text not null unique,
  full_name text not null,
  email text,
  department text,
  phone text,
  academic_level text,
  photo_path text,
  coins integer not null default 0 check (coins >= 0),
  status text not null default 'active' check (status in ('active','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.students add column if not exists phone text;
alter table public.students add column if not exists academic_level text;
alter table public.students add column if not exists photo_path text;
create table if not exists public.nfc_cards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  uid text not null unique,
  status text not null default 'active' check (status in ('active','disabled','lost')),
  can_pay boolean not null default true,
  can_access boolean not null default false,
  can_read boolean not null default true,
  can_write boolean not null default false,
  chip_type text not null default 'NTAG213',
  memory_capacity integer not null default 144 check (memory_capacity between 1 and 65536),
  memory_used integer not null default 0 check (memory_used >= 0 and memory_used <= memory_capacity),
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz
);
alter table public.nfc_cards add column if not exists can_pay boolean not null default true;
alter table public.nfc_cards add column if not exists can_access boolean not null default false;
alter table public.nfc_cards add column if not exists can_read boolean not null default true;
alter table public.nfc_cards add column if not exists can_write boolean not null default false;
alter table public.nfc_cards add column if not exists chip_type text not null default 'NTAG213';
alter table public.nfc_cards add column if not exists memory_capacity integer not null default 144;
alter table public.nfc_cards add column if not exists memory_used integer not null default 0;
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  card_id uuid references public.nfc_cards(id),
  amount integer not null check (amount <> 0),
  kind public.transaction_kind not null,
  description text,
  performed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists students_student_no_idx on public.students(student_no);
create unique index if not exists students_student_no_normalized_uidx on public.students(upper(btrim(student_no)));
create unique index if not exists students_email_normalized_uidx on public.students(lower(btrim(email))) where email is not null;
create index if not exists nfc_cards_uid_idx on public.nfc_cards(uid);
create unique index if not exists nfc_cards_uid_normalized_uidx on public.nfc_cards(upper(regexp_replace(uid,'[^0-9A-Fa-f]','','g')));
create index if not exists transactions_created_at_idx on public.transactions(created_at desc);
create index if not exists transactions_student_idx on public.transactions(student_id,created_at desc);

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','cashier')) $$;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.nfc_cards enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "staff can read profiles" on public.profiles;
create policy "staff can read profiles" on public.profiles for select to authenticated using (public.is_staff());
drop policy if exists "staff can manage students" on public.students;
create policy "staff can manage students" on public.students for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff can manage cards" on public.nfc_cards;
create policy "staff can manage cards" on public.nfc_cards for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff can read transactions" on public.transactions;
create policy "staff can read transactions" on public.transactions for select to authenticated using (public.is_staff());
drop policy if exists "staff can insert transactions" on public.transactions;
create policy "staff can insert transactions" on public.transactions for insert to authenticated with check (public.is_staff());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('student-photos','student-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "staff can manage student photos" on storage.objects;
create policy "staff can manage student photos" on storage.objects for all to authenticated
using (bucket_id='student-photos' and public.is_staff())
with check (bucket_id='student-photos' and public.is_staff());

-- Create/update a profile after a Supabase Auth user is created.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public
as $$ begin
  insert into public.profiles(id,display_name,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name','CampusPay user'),'cashier')
  on conflict(id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Register the wallet and reserve an optional card UID before asking the reader to write.
create or replace function public.register_student(
  p_student_no text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_department text,
  p_academic_level text,
  p_starting_coins integer default 0,
  p_photo_path text default null,
  p_card_uid text default null,
  p_card_type text default null
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  s public.students;
  c public.nfc_cards;
  tx public.transactions;
  uid_clean text;
  uid_display text := '';
  i integer;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Not authorized'; end if;
  if length(btrim(coalesce(p_student_no,''))) not between 2 and 32 then raise exception 'Student ID must be 2 to 32 characters'; end if;
  if length(btrim(coalesce(p_full_name,''))) not between 2 and 120 then raise exception 'Full name must be 2 to 120 characters'; end if;
  if p_email is null or length(btrim(p_email)) > 254 or btrim(p_email) !~* '^[A-Z0-9._%+%-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if length(btrim(coalesce(p_phone,''))) not between 5 and 32 then raise exception 'Enter a valid phone number'; end if;
  if length(btrim(coalesce(p_department,''))) not between 2 and 100 then raise exception 'Faculty or department is required'; end if;
  if length(btrim(coalesce(p_academic_level,''))) not between 1 and 40 then raise exception 'Academic level is required'; end if;
  if p_starting_coins is null or p_starting_coins < 0 or p_starting_coins > 100000 then raise exception 'Starting balance must be between 0 and 100000 coins'; end if;

  if nullif(btrim(coalesce(p_card_uid,'')),'') is not null then
    uid_clean := upper(regexp_replace(p_card_uid,'[^0-9A-Fa-f]','','g'));
    if length(uid_clean) < 6 or length(uid_clean) > 32 or mod(length(uid_clean),2) <> 0 then raise exception 'Reader returned an invalid card UID'; end if;
    for i in 1..length(uid_clean) by 2 loop
      if uid_display <> '' then uid_display := uid_display || ':'; end if;
      uid_display := uid_display || substr(uid_clean,i,2);
    end loop;
  end if;

  insert into public.students(student_no,full_name,email,phone,department,academic_level,photo_path,coins,status)
  values(btrim(p_student_no),btrim(p_full_name),lower(btrim(p_email)),btrim(p_phone),btrim(p_department),btrim(p_academic_level),p_photo_path,p_starting_coins,'active')
  returning * into s;

  if p_starting_coins > 0 then
    insert into public.transactions(student_id,amount,kind,description,performed_by)
    values(s.id,p_starting_coins,'topup','Initial wallet balance',auth.uid()) returning * into tx;
  end if;

  if uid_display <> '' then
    insert into public.nfc_cards(student_id,uid,status,can_pay,can_access,can_read,can_write,chip_type,memory_capacity,memory_used)
    values(s.id,uid_display,'active',true,false,true,true,coalesce(nullif(btrim(p_card_type),''),'ESP32 RFID'),144,0)
    returning * into c;
  end if;

  return jsonb_build_object('student',to_jsonb(s),'card',case when c.id is null then null else to_jsonb(c) end);
end;
$$;

-- Only call through an authenticated staff session. The transaction and balance update are atomic.
create or replace function public.top_up_student(p_student_id uuid,p_amount integer,p_description text default 'Wallet top-up')
returns public.transactions language plpgsql security definer set search_path=public
as $$ declare s public.students; tx public.transactions;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Invalid top-up amount'; end if;
  update public.students set coins=coins+p_amount,updated_at=now()
    where id=p_student_id and status='active' returning * into s;
  if not found then raise exception 'Student not found or account inactive'; end if;
  insert into public.transactions(student_id,amount,kind,description,performed_by)
    values(p_student_id,p_amount,'topup',coalesce(p_description,'Wallet top-up'),auth.uid()) returning * into tx;
  return tx;
end $$;

-- Authoritative card UID lookup + balance check + deduction + ledger insert in one transaction.
create or replace function public.pay_with_wallet(p_card_uid text,p_amount integer,p_description text default 'Cafeteria purchase')
returns public.transactions language plpgsql security definer set search_path=public
as $$ declare c public.nfc_cards; s public.students; tx public.transactions;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Invalid payment amount'; end if;
  select * into c from public.nfc_cards where uid=trim(p_card_uid) and status='active' for update;
  if not found then raise exception 'Card not registered or disabled'; end if;
  if not c.can_read then raise exception 'Card is not authorized for reads'; end if;
  if not c.can_pay then raise exception 'Card is not authorized for payments'; end if;
  update public.students set coins=coins-p_amount,updated_at=now()
    where id=c.student_id and status='active' and coins>=p_amount returning * into s;
  if not found then raise exception 'Insufficient balance or student account inactive'; end if;
  update public.nfc_cards set last_seen_at=now() where id=c.id;
  insert into public.transactions(student_id,card_id,amount,kind,description,performed_by)
    values(s.id,c.id,-p_amount,'payment',coalesce(p_description,'Cafeteria purchase'),auth.uid()) returning * into tx;
  return tx;
end $$;
revoke all on function public.top_up_student(uuid,integer,text) from public;
revoke all on function public.pay_with_wallet(text,integer,text) from public;
revoke all on function public.register_student(text,text,text,text,text,text,integer,text,text,text) from public;
grant execute on function public.top_up_student(uuid,integer,text) to authenticated;
grant execute on function public.pay_with_wallet(text,integer,text) to authenticated;
grant execute on function public.register_student(text,text,text,text,text,text,integer,text,text,text) to authenticated;

-- IMPORTANT: create your first admin in Authentication, then run this with their actual UUID:
-- update public.profiles set role='admin', display_name='Campus Admin' where id='YOUR_AUTH_USER_UUID';
-- Never place the Supabase service_role key in frontend code.

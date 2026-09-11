-- Billing da instalação e operações destrutivas atômicas.

create table if not exists public.platform_billing_plans (
  slug text primary key check (slug in ('standard','pro','enterprise')),
  name text not null check (char_length(name) between 1 and 80),
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  billing_cycle text not null default 'MONTHLY' check (billing_cycle = 'MONTHLY'),
  asaas_payment_link_id text unique,
  checkout_url text,
  active boolean not null default true,
  synced_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_payment_events (
  event_id text primary key,
  event_type text not null,
  provider_payment_id text,
  provider_customer_id text,
  payment_link_id text,
  plan_slug text references public.platform_billing_plans(slug) on delete set null,
  value_cents integer check (value_cents is null or value_cents >= 0),
  status text,
  occurred_at timestamptz,
  payload_minimized jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_slug text not null references public.platform_billing_plans(slug),
  provider_customer_id text,
  provider_subscription_id text,
  provider_payment_id text,
  status text not null default 'pending',
  value_cents integer not null check (value_cents >= 0),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_billing_plans enable row level security;
alter table public.platform_payment_events enable row level security;
alter table public.organization_subscriptions enable row level security;
revoke all on public.platform_billing_plans, public.platform_payment_events, public.organization_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.platform_billing_plans, public.platform_payment_events, public.organization_subscriptions to service_role;

insert into public.platform_billing_plans(slug,name,price_cents)
values ('standard','Standard',19700),('pro','Pro',49700),('enterprise','Enterprise',99700)
on conflict (slug) do nothing;

-- Uma exclusão pedida pelo usuário é definitiva. Os runs deixam de bloquear o
-- cascade do agente e de suas versões.
alter table public.ai_agent_runs drop constraint if exists ai_agent_runs_agent_id_fkey;
alter table public.ai_agent_runs add constraint ai_agent_runs_agent_id_fkey
  foreign key (agent_id) references public.ai_agents(id) on delete cascade;

create or replace function public.fn_delete_contacts_bulk(
  p_organization_id uuid,
  p_contact_ids uuid[] default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_messages integer := 0;
  v_conversations integer := 0;
  v_contacts integer := 0;
begin
  select coalesce(array_agg(c.id), '{}'::uuid[]) into v_ids
  from public.contacts c
  where c.organization_id = p_organization_id
    and (p_contact_ids is null or c.id = any(p_contact_ids));

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('contacts',0,'conversations',0,'messages',0);
  end if;

  delete from public.messages m
   where m.organization_id = p_organization_id and m.contact_id = any(v_ids);
  get diagnostics v_messages = row_count;

  delete from public.conversations c
   where c.organization_id = p_organization_id and c.contact_id = any(v_ids);
  get diagnostics v_conversations = row_count;

  delete from public.contacts c
   where c.organization_id = p_organization_id and c.id = any(v_ids);
  get diagnostics v_contacts = row_count;

  return jsonb_build_object('contacts',v_contacts,'conversations',v_conversations,'messages',v_messages);
end;
$$;
revoke all on function public.fn_delete_contacts_bulk(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.fn_delete_contacts_bulk(uuid,uuid[]) to service_role;

create or replace function public.fn_delete_ai_agent_definitive(
  p_organization_id uuid,
  p_agent_id uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_deleted integer := 0;
begin
  update public.organizations
     set settings = jsonb_set(
       coalesce(settings, '{}'::jsonb),
       '{external_agent}',
       coalesce(settings->'external_agent','{}'::jsonb) - 'agent_id',
       true
     )
   where id = p_organization_id
     and settings->'external_agent'->>'agent_id' = p_agent_id::text;

  delete from public.ai_agents
   where id = p_agent_id and organization_id = p_organization_id and not is_default;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;
revoke all on function public.fn_delete_ai_agent_definitive(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fn_delete_ai_agent_definitive(uuid,uuid) to service_role;

create or replace function public.fn_record_asaas_event(
  p_event_id text,
  p_event_type text,
  p_payment_id text,
  p_customer_id text,
  p_payment_link_id text,
  p_value_cents integer,
  p_status text,
  p_occurred_at timestamptz,
  p_payload_minimized jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
begin
  select slug into v_plan from public.platform_billing_plans where asaas_payment_link_id = p_payment_link_id;
  insert into public.platform_payment_events(event_id,event_type,provider_payment_id,provider_customer_id,payment_link_id,plan_slug,value_cents,status,occurred_at,payload_minimized)
  values(p_event_id,p_event_type,p_payment_id,p_customer_id,p_payment_link_id,v_plan,p_value_cents,p_status,p_occurred_at,coalesce(p_payload_minimized,'{}'::jsonb))
  on conflict(event_id) do nothing;
  return found;
end;
$$;
revoke all on function public.fn_record_asaas_event(text,text,text,text,text,integer,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.fn_record_asaas_event(text,text,text,text,text,integer,text,timestamptz,jsonb) to service_role;

notify pgrst, 'reload schema';

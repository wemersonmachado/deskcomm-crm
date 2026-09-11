-- Provisionamento idempotente após confirmação financeira do Asaas.
-- O e-mail não é persistido: somente SHA-256 para correlação sem PII legível.

create table if not exists public.platform_checkout_access (
  purchase_key text primary key,
  provider_payment_id text not null,
  provider_subscription_id text,
  provider_customer_id text not null,
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  invite_id uuid not null unique,
  issued_at bigint not null,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_checkout_access enable row level security;
revoke all on public.platform_checkout_access from public, anon, authenticated;
grant select, insert, update, delete on public.platform_checkout_access to service_role;

create or replace function public.fn_provision_paid_checkout(
  p_payment_id text,
  p_subscription_id text,
  p_customer_id text,
  p_payment_link_id text,
  p_value_cents integer,
  p_customer_name text,
  p_email_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_purchase_key text := coalesce(nullif(p_subscription_id, ''), 'payment:' || p_payment_id);
  v_plan public.platform_billing_plans%rowtype;
  v_access public.platform_checkout_access%rowtype;
  v_org public.organizations%rowtype;
begin
  if p_payment_id is null or p_customer_id is null or p_payment_link_id is null
    or p_value_cents is null or p_customer_name is null or p_email_hash is null then
    return jsonb_build_object('eligible', false, 'reason', 'missing_required_data');
  end if;
  if p_email_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('eligible', false, 'reason', 'invalid_email_hash');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('paid-checkout:' || v_purchase_key, 0));
  select * into v_access from public.platform_checkout_access where purchase_key = v_purchase_key;
  if found then
    select display_name into v_org.display_name from public.organizations where id = v_access.organization_id;
    select name into v_plan.name
      from public.organization_subscriptions s
      join public.platform_billing_plans p on p.slug = s.plan_slug
      where s.organization_id = v_access.organization_id;
    return jsonb_build_object(
      'eligible', true, 'created', false,
      'organization_id', v_access.organization_id,
      'organization_name', v_org.display_name,
      'plan_name', v_plan.name,
      'invite_id', v_access.invite_id,
      'issued_at', v_access.issued_at,
      'email_sent_at', v_access.email_sent_at
    );
  end if;

  select * into v_plan from public.platform_billing_plans
    where asaas_payment_link_id = p_payment_link_id and active;
  if not found then
    return jsonb_build_object('eligible', false, 'reason', 'unknown_or_inactive_payment_link');
  end if;
  if v_plan.price_cents <> p_value_cents then
    return jsonb_build_object('eligible', false, 'reason', 'payment_value_mismatch');
  end if;

  insert into public.organizations(display_name, slug, legal_name, status, settings, created_by)
  values (
    left(trim(p_customer_name), 120),
    'xgo-' || substr(md5(p_customer_id || ':' || v_purchase_key), 1, 24),
    left(trim(p_customer_name), 255),
    'active',
    jsonb_build_object(
      'plan', v_plan.slug,
      'interface_default', jsonb_build_object('preset', 'completa')
    ),
    null
  ) returning * into v_org;

  insert into public.organization_subscriptions(
    organization_id, plan_slug, provider_customer_id, provider_subscription_id,
    provider_payment_id, status, value_cents
  ) values (
    v_org.id, v_plan.slug, p_customer_id, nullif(p_subscription_id, ''),
    p_payment_id, 'active', p_value_cents
  );

  insert into public.platform_checkout_access(
    purchase_key, provider_payment_id, provider_subscription_id, provider_customer_id,
    organization_id, invite_id, issued_at, email_hash
  ) values (
    v_purchase_key, p_payment_id, nullif(p_subscription_id, ''), p_customer_id,
    v_org.id, gen_random_uuid(), floor(extract(epoch from now()))::bigint, p_email_hash
  ) returning * into v_access;

  return jsonb_build_object(
    'eligible', true, 'created', true,
    'organization_id', v_org.id,
    'organization_name', v_org.display_name,
    'plan_name', v_plan.name,
    'invite_id', v_access.invite_id,
    'issued_at', v_access.issued_at,
    'email_sent_at', null
  );
end;
$$;

revoke all on function public.fn_provision_paid_checkout(text,text,text,text,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.fn_provision_paid_checkout(text,text,text,text,integer,text,text)
  to service_role;

notify pgrst, 'reload schema';

-- O perfil escolhido na criação é a apresentação inicial DA organização.
-- Cada vínculo continua podendo ter override próprio depois; isto não concede
-- permissão e não substitui RBAC/RLS.
create or replace function public.fn_create_tenant_with_owner(
  p_actor uuid, p_key uuid, p_request jsonb, p_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior public.idempotency_keys%rowtype;
  org public.organizations%rowtype;
  result jsonb;
  interface_default jsonb := coalesce(
    p_request->'owner_interface_settings',
    '{"preset":"completa"}'::jsonb
  );
begin
  if not exists (select 1 from public.platform_admins where user_id = p_actor
    and revoked_at is null and scope = 'full') then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if jsonb_typeof(interface_default) <> 'object'
    or interface_default->>'preset' not in ('completa', 'simplificada') then
    raise exception 'invalid_interface_settings' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_key::text, 0));
  select * into prior from public.idempotency_keys
    where key = p_key::text and endpoint = '/api/v1/admin/tenants:' || p_actor::text
      and expires_at > now() and tenant_creation_trusted;
  if found then
    if prior.request_hash <> decode(p_hash, 'hex') then
      raise exception 'idempotency_conflict' using errcode = '22023';
    end if;
    if prior.response_body->>'id' is distinct from prior.organization_id::text
      or not exists (select 1 from public.organizations where id = prior.organization_id and created_by = p_actor) then
      raise exception 'idempotency_provenance_invalid' using errcode = '22023';
    end if;
    return prior.response_body || jsonb_build_object('created', false);
  end if;
  insert into public.organizations(display_name, slug, legal_name, cnpj, status, settings, created_by)
    values (
      p_request->>'display_name',
      p_request->>'slug',
      coalesce(nullif(p_request->>'legal_name', ''), p_request->>'display_name'),
      p_request->>'cnpj',
      'active',
      jsonb_build_object('plan', p_request->>'plan', 'interface_default', interface_default),
      p_actor
    )
    returning * into org;
  insert into public.user_organizations(organization_id, user_id, role, accepted_at, interface_settings)
    values (org.id, p_actor, 'admin', now(), interface_default);
  result := jsonb_build_object(
    'id', org.id,
    'slug', org.slug,
    'display_name', org.display_name,
    'invite_id', gen_random_uuid(),
    'issued_at', floor(extract(epoch from now()))::bigint
  );
  insert into public.idempotency_keys(organization_id, key, endpoint, request_hash, status_code, response_body, tenant_creation_trusted)
    values (
      org.id,
      p_key::text,
      '/api/v1/admin/tenants:' || p_actor::text,
      decode(p_hash, 'hex'),
      201,
      result,
      true
    );
  return result || jsonb_build_object('created', true);
end $$;
revoke all on function public.fn_create_tenant_with_owner(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.fn_create_tenant_with_owner(uuid, uuid, jsonb, text) to service_role;

notify pgrst, 'reload schema';

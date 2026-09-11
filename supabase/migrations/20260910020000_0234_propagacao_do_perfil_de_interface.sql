-- O padrão visual de uma organização precisa alcançar os membros que AINDA
-- usam o padrão anterior. Quem já tem uma seleção diferente é uma configuração
-- individual e não pode ser sobrescrito pela administração da organização.
--
-- A operação é atômica: a organização não pode ficar com o novo padrão enquanto
-- os membros herdados continuam no anterior por uma falha entre dois requests.
create or replace function public.fn_update_organization_with_interface_default(
  p_organization_id uuid,
  p_display_name text,
  p_legal_name text,
  p_cnpj text,
  p_timezone text,
  p_locale text,
  p_currency text,
  p_media_retention_days integer,
  p_dpo_email text,
  p_privacy_policy_url text,
  p_settings jsonb,
  p_propagate_interface_default boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  previous_settings jsonb;
  previous_default jsonb;
  members_updated integer := 0;
begin
  select settings into previous_settings
    from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'organization_not_found' using errcode = 'P0002'; end if;

  previous_default := coalesce(previous_settings->'interface_default', '{"preset":"completa"}'::jsonb);
  update public.organizations set
    display_name = p_display_name,
    legal_name = p_legal_name,
    cnpj = p_cnpj,
    timezone = p_timezone,
    locale = p_locale,
    currency = p_currency,
    media_retention_days = p_media_retention_days,
    dpo_email = p_dpo_email,
    privacy_policy_url = p_privacy_policy_url,
    settings = p_settings
  where id = p_organization_id;

  if p_propagate_interface_default
    and p_settings ? 'interface_default'
    and previous_default is distinct from p_settings->'interface_default' then
    update public.user_organizations
       set interface_settings = p_settings->'interface_default'
     where organization_id = p_organization_id
       and revoked_at is null
       and accepted_at is not null
       and interface_settings = previous_default;
    get diagnostics members_updated = row_count;
  end if;

  return jsonb_build_object('members_updated', members_updated);
end;
$$;
revoke all on function public.fn_update_organization_with_interface_default(uuid,text,text,text,text,text,text,integer,text,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.fn_update_organization_with_interface_default(uuid,text,text,text,text,text,text,integer,text,text,jsonb,boolean) to service_role;

notify pgrst, 'reload schema';

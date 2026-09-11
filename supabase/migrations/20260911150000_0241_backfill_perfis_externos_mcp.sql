-- Perfis MCP externos configurados antes de 0240 tinham somente o ponteiro
-- em organizations.settings. Materializa um perfil rascunho exibível para
-- cada organização afetada, sem mover bearer (que continua em api_tokens).
do $backfill_external_mcp$
declare
  org record;
  perfil_id uuid;
begin
  for org in
    select id, settings
      from public.organizations
     where settings ->> 'ai_dispatch_mode' = 'external'
       and coalesce(settings -> 'external_agent' ->> 'configuration_source', 'external') = 'external'
       and nullif(settings -> 'external_agent' ->> 'agent_id', '') is null
     for update
  loop
    insert into public.ai_agents (
      organization_id,
      name,
      description,
      model,
      system_prompt,
      kind,
      priority,
      is_active,
      is_default,
      config
    ) values (
      org.id,
      'Agente externo (MCP)',
      'Runtime externo conectado por MCP.',
      'external-runtime',
      'Este perfil representa um agente executado fora da plataforma. Configure aqui as instruções, capacidades e memória que desejar manter no CRM.',
      'mcp_agent',
      0,
      false,
      false,
      jsonb_build_object(
        'external_mcp_registration',
        jsonb_build_object('state', 'registered', 'created_by', 'migration_0241')
      )
    ) returning id into perfil_id;

    insert into public.ai_agent_versions (
      organization_id,
      agent_id,
      version_number,
      system_prompt,
      provider,
      model,
      credential_id,
      channel_session_id,
      status
    ) values (
      org.id,
      perfil_id,
      1,
      'Este perfil representa um agente executado fora da plataforma. Configure aqui as instruções, capacidades e memória que desejar manter no CRM.',
      'anthropic',
      'external-runtime',
      null,
      null,
      'draft'
    );

    update public.organizations
       set settings = jsonb_set(
         coalesce(org.settings, '{}'::jsonb),
         '{external_agent}',
         case when jsonb_typeof(org.settings -> 'external_agent') = 'object'
           then org.settings -> 'external_agent'
           else '{}'::jsonb
         end
           || jsonb_build_object('agent_id', perfil_id::text),
         true
       )
     where id = org.id;
  end loop;
end;
$backfill_external_mcp$;

notify pgrst, 'reload schema';

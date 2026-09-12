-- Um perfil de agente externo pode existir antes de a organização conectar um
-- WhatsApp. Ele permanece rascunho; fn_publish_ai_agent_version continua
-- recusando publicação sem channel_session válido.
alter table public.ai_agent_versions
  alter column channel_session_id drop not null;

notify pgrst, 'reload schema';

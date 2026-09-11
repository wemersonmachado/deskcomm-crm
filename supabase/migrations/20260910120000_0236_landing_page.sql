-- BEGIN 0236_landing_page
-- Configuração pública não contém segredos. Escrita segue o guard de plataforma.
alter table public.platform_branding
  add column if not exists landing_page jsonb not null default '{}'::jsonb;
-- END 0236_landing_page

-- 0235 — provedores adicionais no editor de agentes
--
-- O runtime e a tela passam a oferecer Mistral, Groq e Cloudflare Workers AI.
-- O catálogo precisa conhecer ao menos os modelos canônicos para que a função
-- de publicação não recuse com model_not_found. Preço desconhecido fica NULL:
-- zero significaria, falsamente, que o uso é grátis.
insert into public.ai_models
  (provider, model_id, display_name, description, context_window,
   input_price_per_million_cents, output_price_per_million_cents,
   supports_tools, is_default_for_provider)
values
  ('mistral', 'mistral-small-latest', 'Mistral Small (latest)',
   'Modelo rápido e econômico da Mistral para atendimento.', null, null, null, true, true),
  ('mistral', 'mistral-large-latest', 'Mistral Large (latest)',
   'Modelo de maior capacidade da Mistral.', null, null, null, true, false),
  ('groq', 'openai/gpt-oss-20b', 'GPT-OSS 20B na Groq',
   'Modelo aberto rápido para tarefas de atendimento.', 131072, 8, 30, true, true),
  ('groq', 'openai/gpt-oss-120b', 'GPT-OSS 120B na Groq',
   'Modelo aberto de maior capacidade servido pela Groq.', 131072, 15, 60, true, false),
  ('cloudflare', '@cf/openai/gpt-oss-20b', 'GPT-OSS 20B no Workers AI',
   'Modelo aberto executado na rede da Cloudflare.', null, null, null, true, true),
  ('cloudflare', '@cf/openai/gpt-oss-120b', 'GPT-OSS 120B no Workers AI',
   'Modelo aberto de maior capacidade no Workers AI.', null, null, null, true, false)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  context_window = excluded.context_window,
  input_price_per_million_cents = excluded.input_price_per_million_cents,
  output_price_per_million_cents = excluded.output_price_per_million_cents,
  supports_tools = excluded.supports_tools;

update public.ai_models
   set is_default_for_provider = false
 where provider in ('mistral', 'groq', 'cloudflare')
   and is_default_for_provider;

update public.ai_models
   set is_default_for_provider = true
 where (provider = 'mistral' and model_id = 'mistral-small-latest')
    or (provider = 'groq' and model_id = 'openai/gpt-oss-20b')
    or (provider = 'cloudflare' and model_id = '@cf/openai/gpt-oss-20b');

insert into public.ai_pricing
  (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, notes)
values
  ('openai/gpt-oss-20b', 8, 30, 'Groq; conferido no catálogo oficial em 2026-09-10'),
  ('openai/gpt-oss-120b', 15, 60, 'Groq; conferido no catálogo oficial em 2026-09-10')
on conflict (model) do update set
  prompt_cents_per_million_tokens = excluded.prompt_cents_per_million_tokens,
  completion_cents_per_million_tokens = excluded.completion_cents_per_million_tokens,
  notes = excluded.notes,
  superseded_at = null;

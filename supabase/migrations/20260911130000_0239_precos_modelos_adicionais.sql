-- 0239 — preço verificável para modelos adicionados em 0235.
--
-- 0235 publicou os modelos sem atribuir gratuidade fictícia. Os preços já foram
-- confirmados nos catálogos oficiais dos provedores; este forward-fix mantém o
-- custo da tela e o teto de orçamento na mesma fonte de verdade.

update public.ai_models
   set input_price_per_million_cents = case
         when provider = 'mistral' and model_id = 'mistral-small-latest' then 15
         when provider = 'mistral' and model_id = 'mistral-large-latest' then 50
         when provider = 'cloudflare' and model_id = '@cf/openai/gpt-oss-20b' then 20
         when provider = 'cloudflare' and model_id = '@cf/openai/gpt-oss-120b' then 35
       end,
       output_price_per_million_cents = case
         when provider = 'mistral' and model_id = 'mistral-small-latest' then 60
         when provider = 'mistral' and model_id = 'mistral-large-latest' then 150
         when provider = 'cloudflare' and model_id = '@cf/openai/gpt-oss-20b' then 30
         when provider = 'cloudflare' and model_id = '@cf/openai/gpt-oss-120b' then 75
       end
 where (provider, model_id) in (
   ('mistral', 'mistral-small-latest'),
   ('mistral', 'mistral-large-latest'),
   ('cloudflare', '@cf/openai/gpt-oss-20b'),
   ('cloudflare', '@cf/openai/gpt-oss-120b')
 );

insert into public.ai_pricing
  (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, notes)
values
  ('mistral-small-latest', 15, 60, 'catálogo Mistral; conferido em 2026-09-11'),
  ('mistral-large-latest', 50, 150, 'catálogo Mistral; conferido em 2026-09-11'),
  ('@cf/openai/gpt-oss-20b', 20, 30, 'catálogo Cloudflare Workers AI; conferido em 2026-09-11'),
  ('@cf/openai/gpt-oss-120b', 35, 75, 'catálogo Cloudflare Workers AI; conferido em 2026-09-11')
on conflict (model) do update set
  prompt_cents_per_million_tokens = excluded.prompt_cents_per_million_tokens,
  completion_cents_per_million_tokens = excluded.completion_cents_per_million_tokens,
  notes = excluded.notes,
  superseded_at = null;

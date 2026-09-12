# Agentes externos MCP — entrega e operação

## Escopo

PR: https://github.com/wemersonmachado/deskcomm-crm/pull/8

- Perfil externo visível em `/app/ai/agents`, inclusive para organizações que já
  haviam habilitado a execução externa antes desta entrega (backfill 0241).
- Edição do rascunho externo: nome, instruções, capacidades e referências do
  acervo, sem exigir credencial de LLM ou número WhatsApp local para salvar.
- `crm_create_contact` e `crm_update_contact`, pelo mesmo handler do CRM,
  com `mcp:write` e papel mínimo `ai_operator` (ou superior).
- Tokens comuns usam o emitente real na autoria do contato, nunca o UUID do
  token numa FK de usuário. Auditoria conserva também o identificador do token.
- Respostas de escrita projetadas: não expõem CPF/hash, metadados internos ou
  campos livres. Consultas e escritas preservam o limite da organização.

## Limites que a interface precisa respeitar

Um perfil registrado não comprova que a VPS está online. O cartão nasce como
rascunho, não como atendimento nativo ativo. MCP não hospeda nem inicia Hermes.
No modo que preserva instruções externas, a VPS continua dona dessas instruções.
Para consumir configuração publicada da plataforma, o cliente precisa chamar
`crm_get_agent_configuration` e interpretar o contrato. Salvar um rascunho não
publica nem altera sozinho o programa remoto. Publicação/execução nativa mantém
as exigências de canal e credencial; elas não foram removidas para liberar edição.

## Correções do CI

Falhas confirmadas no run `34633580825`:

- CSP bloqueava imagem do Storage Supabase HTTP local; agora permite somente a
  origem configurada, sem abrir imagens HTTP de qualquer servidor.
- Página-ponte do callback Google tinha script sem nonce; passa a usar o nonce
  gerado pelo proxy, mantendo a sessão Strict e a proteção de scripts.
- Teste Billing esperava título antigo. A prova continua exigindo acesso admin
  e acessibilidade na tela atual “Plano e cobrança”.
- Autosave era testado por estado transitório. A prova agora aguarda o registro
  persistido e reabre o rascunho.
- Teste de capacidade libera o número de vagas exigido pelo catálogo atual,
  preservando recusa acima do teto e opt-in separado para envio de WhatsApp.

## Validação reproduzível

- `pnpm typecheck` e ESLint dos arquivos alterados.
- Testes dirigidos de autenticação/auditoria MCP, escrita de contatos, rascunho,
  nonce Google, CSP, configuração externa e cobertura das specs.
- `tests/e2e/external-mcp-profile.spec.ts`: navegador, criação de perfil pela
  interface, reedição após reload, escrita MCP real, isolamento entre duas
  organizações e recusa sem escopo de escrita. Incluído na parte 2 do CI.
- Mesma jornada para produção: `scripts/qa-external-mcp-production.ts` com
  `QA_ALLOW_PRODUCTION_FIXTURES=1`. Cria apenas fixtures sintéticas isoladas,
  não envia mensagens e remove as fixtures ao terminar. Imagem local em
  `.superpowers/evidence/mcp-profile/externo-visivel.png` (não versionada).

Não confundir testes unitários com prova de produção. A promoção exige os cinco
checks do commit final e a verificação no domínio após o deploy.

## Migração e deploy

Arquivos: `20260911140000_0240_perfil_externo_sem_canal.sql` e
`20260911150000_0241_backfill_perfis_externos_mcp.sql`, também no baseline e MANIFEST.
O backfill bloqueia a linha da organização antes de atualizar settings, preserva
os campos existentes e não recria um perfil já vinculado.

`scripts/apply-external-mcp-migrations.mjs` inspeciona sem alterar por padrão.
Com `--apply`, aplica somente estes dois arquivos, em transação, com lock,
timeout e ledger de migrações. Esta instalação nasceu por baseline sem ledger:
o runner registra apenas o que efetivamente aplicou, não inventa histórico.
Usar variáveis do Railway em memória; não imprimir nem copiar valores para docs.

Após merge e publicação GHCR, atualizar a origem da imagem no serviço `app`
Railway (`deployment redeploy --from-source`). Projeto
`b413d989-448e-4a07-a044-12cba463fe9a`, ambiente
`c1df60fd-7f43-40a2-acd2-446294d1bb04`, serviço
`2f931999-72d5-4ad1-8fbb-2712237ba503`.
Verificar digest/revisão e executar a jornada em `https://xgoos.com.br`.
Rollback de aplicação: retornar ao deployment anterior; não remover perfis nem
restaurar NOT NULL no canal enquanto houver rascunhos externos sem canal.

Nenhum valor de credencial é necessário nos documentos ou neste commit.
`.env` e cofre locais permanecem protegidos; Paint Inspector Pro não foi alterado.

# Landing e configuração de agentes externos — 2026-09-10

## Implementação

- Página pública em `/`, código isolado em `landing-page/`, no Railway existente.
- Editor em Configurações → Página de apresentação, exclusivo de superadministrador. Valores demonstrativos; sem checkout ou liberação pública de organizações.
- Configurações → API Tokens: selecionar executor nativo/externo e origem das instruções externo/plataforma.
- `crm_get_agent_configuration`: ferramenta de leitura com `mcp:read`, org derivada do token, consulta somente a versão publicada, sem exportar credenciais. Alterações ainda em rascunho não são fornecidas.
- Gravação das opções externas por administrador com guard/MFA, validação estrita e compare-and-swap que preserva configurações concorrentes de marca/interface.
- Correções complementares: rascunho não revalida rota durante render; card preserva nome visível; novos provedores usam Chat Completions.

## Contrato externo — CONFIRMADO pelo código

1. Crie um token da organização com os menores escopos necessários e conecte seu cliente a `/api/mcp` via HTTPS, bearer em cabeçalho.
2. Mantenha a execução nativa enquanto prepara o runtime externo. Selecionar origem de configuração não inicia o agente da VPS.
3. O runtime externo chama `crm_get_agent_configuration` antes do atendimento. `contract_version: 1` e `configuration_source: external` significam preservar suas instruções. `platform` retorna instruções/ferramentas/referências e limites explícitos da versão publicada.
4. O runtime deve interpretar o contrato; não existe importação automática do código da VPS, credencial do provedor nem garantia de equivalência entre engines. Conhecimento/funis são referências, consultados via ferramentas autorizadas.
5. Somente depois de preparar o runtime, salve o executor como externo. Isso desliga o processamento nativo de novas mensagens para evitar dois respondedores. O cliente externo continua responsável por receber/buscar eventos e responder, respeitando autorização e guards do CRM.
6. Ao arquivar/remover a referência publicada, a leitura falha fechada. Para voltar ao nativo, salve explicitamente essa opção; não existe fallback silencioso que gere respostas duplicadas.

## Banco e rollback

Migration aditiva `20260910120000_0236_landing_page.sql`, apêndice idêntico no baseline e MANIFEST. Aplicada isoladamente em produção; não foi utilizado `db push` sobre histórico remoto vazio. Não altera RLS ou configurações de organizações existentes.

Rollback da página: reimplantar commit anterior. Coluna aditiva pode permanecer. Configuração MCP é opt-in por organização; voltar a `native` pela tela reativa o processamento nativo de novas mensagens.

## Evidências e limites

- Primeira rodada direcionada: 226 testes passaram (landing, MCP, navegação, catálogo e provedores).
- Verificação completa de produção e evidências visuais: em andamento, não certificadas nesta versão do relatório.
- `test:db` depende de Docker, indisponível nesta máquina. Migration aplicada e coluna confirmada não equivalem à suíte de invariantes completa.
- Skill `cloudflare:web-perf`: auditoria de Core Web Vitals bloqueada por ausência de Chrome DevTools MCP. Não há nota de Lighthouse ou ganho de velocidade certificado.
- CTA comercial depende do endereço escolhido pelo dono e permanece editável. Não inventar telefone, SLA, clientes ou resultados comerciais.
- Segredos não pertencem a este documento. Configuração operacional permanece no ambiente protegido dos serviços; nunca publicar `.env` ou tokens.

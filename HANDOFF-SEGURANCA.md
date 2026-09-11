# Segurança e envio de e-mail — 2026-09-10

## Estado e fonte

Clone de trabalho: `D:/PROJETOS/Agentes/Agentes/DeskComm-codex-support-nav`.
Base: `ec564089`. Checkpoint de retorno: branch
`codex/checkpoint-security-20260910`. Não confundir este clone com o checkout
principal `D:/PROJETOS/Agentes/Agentes/DeskComm`.

## Produção confirmada

Código de segurança publicado no Railway pelo deployment
`a8f1e744-7919-4a2a-968a-358914811290` (`SUCCESS`). Após a troca, a produção
respondeu saudável com Supabase, Redis e WAHA em `ok`; login HTTP 200 em
Chromium, CSP/nonce/HSTS/request-id presentes, zero erros de console, API de
equipe sem sessão em 401 e `/app` redirecionando para login.

Envio da recuperação de senha pelo Supabase, transportado pelo SMTP Resend:
HTTP 200 e evento Resend `delivered`. Os 12 templates foram aplicados e relidos.
App e worker receberam as variáveis necessárias e foram redeployados com a
versão existente. IDs, causa raiz e limites da prova estão no
[runbook do domínio](docs/runbooks/xgoos-dominio-email.md).

DMARC em modo inicial `p=none` publicado. O MX pendente é de recebimento,
não de envio. Não é necessário esperar inbound para usar SMTP.

## Alterações de segurança desta entrega

- O override de platform admin não dispensa o segundo fator cadastrado.
- `fail()` remove mensagens/detalhes internos de respostas HTTP 5xx.
- Fallback de e-mail não registra destinatário, assunto ou corpo; falhas do
  provedor retornam mensagens genéricas.
- CSP de runtime com nonce em scripts, origem Supabase configurável e HSTS
  apenas em instalações HTTPS. Styles inline preservados para Radix/branding.
- Upload outbound recusa SVG, categorias MIME desconhecidas e tamanhos inválidos.
- Piso transitivo de Hono atualizado. Audit de produção do lock retornou zero
  advisories após a atualização.
- Novas senhas exigem no mínimo oito caracteres, maiúscula, minúscula, número
  e símbolo tanto no aplicativo quanto no Supabase. O login preserva contas
  existentes; a regra forte vale para convite, recuperação e troca.

## Validação

59 testes direcionados de segurança/autorização/e-mail passaram; depois, 20
testes de senha e remetente passaram novamente. Typecheck e lint passaram sem
erros. O build de produção passou. A tela de login foi aberta com Chromium no
artefato de produção: HTTP 200, CSP/nonce/HSTS/request-id presentes, formulário
visível e zero erros de console. A suíte unitária completa apresentou falhas e
timeouts fora deste recorte e foi interrompida, portanto não é declarada verde.
Docker não foi encontrado no PATH; esta entrega não muda schema/RLS.

## Pendências reais

CAPTCHA permanece desativado: o token Cloudflare disponível recebe HTTP 403 na
API de widgets Turnstile. É necessário um token com `Account > Turnstile > Edit`
para provisionar as chaves e integrar todos os fluxos antes de ativar no
Supabase (ativar só o servidor quebra login). A verificação de senhas vazadas
do Supabase exige plano Pro e a API respondeu HTTP 402; a política forte local
e remota está ativa, mas não substitui HIBP. Rate limit distribuído, cobertura
integral de APIs, arquivos por assinatura/antimalware e criptografia de backups
não são certificados por esta rodada.
RLS habilitada não é prova de todas as políticas entre tenants.

A chave Resend foi exposta no chat; o titular autorizou uso temporário e está
providenciando troca. Substituir coordenadamente no app, worker, Supabase SMTP
e cofre; só depois revogar a anterior. Nunca gravar valores em Markdown/Git.

Uma varredura integral do histórico Git examinou 3.077 commits. Os achados
foram fixtures, identificadores internos, evidências e um hash legado; nenhum
valor coincidiu com as credenciais operacionais atuais. Isso não elimina a
necessidade de rotação da chave Resend exposta no chat.

Nenhuma auditoria permite afirmar segurança absoluta. O Turnstile e o recurso
HIBP dependente de plano permanecem explicitamente delimitados; todo o restante
desta entrega foi publicado e relido em produção.

## Encerramento da correção de e-mail

Resend confirmou entrega; a URL do botão foi inspecionada sem consumir o token:
origem `https://xgoos.com.br`, caminho `/auth/confirm`, `type=recovery` e token
presentes. DMARC também foi resolvido por DNS público. Não publicar as mudanças
locais de segurança com base apenas no sucesso deste envio.

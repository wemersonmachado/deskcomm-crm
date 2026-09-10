# Operação do domínio XGOOS

## Escopo e fonte de verdade

Esta instalação pública usa `https://xgoos.com.br` como URL canônica. O alias
`https://www.xgoos.com.br` também é atendido pelo mesmo serviço Railway. A
configuração de DNS fica na zona Cloudflare de `xgoos.com.br`; o Registro.br
apenas delega os nameservers da zona.

Não registre segredos neste documento, em issues, logs ou commits. Os valores
operacionais vivem somente no arquivo local ignorado `.env` e no cofre local
`CREDENCIAIS-NÃO APAGAR/`. O `.env.example` continua sendo somente um modelo
seguro para instalações novas.

## Topologia

| Componente | Responsabilidade |
|---|---|
| Cloudflare | Zona DNS e registros DNS-only para Railway e Resend |
| Railway | Hospedagem da aplicação, TLS de `xgoos.com.br` e `www.xgoos.com.br` |
| Resend | Domínio remetente `mail.xgoos.com.br` e API de mensagens da aplicação |
| Supabase Auth | SMTP do Resend, URL canônica, redirects e templates de autenticação |

Os CNAMEs de Railway devem permanecer em modo **DNS only** (sem proxy) para
que a emissão e renovação do certificado seja gerenciada pelo Railway.

## Variáveis e armazenamento seguro

| Variável | Uso | Onde configurar |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Alterar a zona DNS | `.env` local apenas |
| `SUPABASE_ACCESS_TOKEN` | Management API do Supabase Auth | `.env` local apenas |
| `RESEND_API_KEY` | API de e-mail da aplicação e SMTP do Supabase | `.env` local e variável Railway |
| `RESEND_FROM_EMAIL` | Remetente transacional | `.env` local e variável Railway |
| `NEXT_PUBLIC_APP_URL` | URL canônica de links e callbacks | `.env` local e variável Railway |

Nunca copie valores dessas variáveis para Markdown, tickets, chat ou Git. Ao
rotacionar qualquer uma, atualize o cofre, o `.env` local e a variável
correspondente no Railway antes de revogar a anterior.

## Autenticação por e-mail

O Supabase Auth deve usar SMTP autenticado do Resend (`smtp.resend.com`, porta
587, STARTTLS, usuário `resend`) e o remetente
`noreply@mail.xgoos.com.br`. A senha SMTP é a própria `RESEND_API_KEY` e não
deve ser salva em texto fora do ambiente seguro.

Os templates administrados no Supabase são:

- confirmação de cadastro;
- convite para a organização;
- link mágico;
- recuperação e redefinição de senha;
- troca de e-mail e notificações de troca de senha/e-mail;
- reautenticação e eventos de MFA/identidade vinculada.

A política de senha desta instalação exige oito caracteres ou mais e pelo
menos uma letra minúscula, uma maiúscula, um número e um símbolo. O aplicativo
aplica a mesma regra ao convite, recuperação e troca de senha.

O renderizador versionado é
`hostgator-setup-kit/marca-emails.sh`. Ele aplica os templates e verifica os
marcadores esperados; execute-o somente com `.env` local completo e sem
imprimir seu conteúdo.

## Verificação e manutenção

1. Confirme no Railway que os dois domínios estão `ACTIVE`, verificados e com
   certificado `VALID`.
2. Confirme que `capabilities.sending` está `enabled` e os registros de DKIM e
   SPF de envio estão `verified`. `partially_verified` não impede envio quando
   somente o MX de **recebimento** está pendente. Não confunda inbound com SMTP.
3. Confirme no Supabase Auth: `site_url=https://xgoos.com.br`, redirects para
   raiz e `www`, SMTP Resend habilitado e cadastro público desabilitado.
4. Faça um deploy único do Railway após a alteração das variáveis e valide
   `https://xgoos.com.br/api/v1/health`.
5. Em um e-mail de teste autorizado, valide convite e recuperação de senha
   pelo navegador. Não trate configuração de SMTP como prova de entrega em
   caixa postal.

Para diagnóstico, consulte os painéis de domínio do Railway, de domínio do
Resend e de Auth do Supabase. Não coloque tokens em URLs, comandos copiados ou
saídas de terminal.

## Incidente de envio — 2026-09-10

CONFIRMADO por API, não inferido do `.env`: `app` tinha chave Resend, mas não
`RESEND_FROM_EMAIL`; `worker` não tinha nenhuma das duas. O Supabase estava sem
SMTP personalizado e com o hook de envio desativado. DKIM e SPF já estavam
verificados: aguardar o MX de recebimento não resolveria a falta das variáveis.

Correção aplicada: remetente no `app`, chave e remetente no `worker`, SMTP
Resend no Supabase e releitura exata dos 12 templates versionados. Cadastro
público permaneceu desabilitado. Redeploys da versão existente, sem incluir
as alterações locais de segurança ainda em validação:

- app: `104fee71-90e2-4485-ac8a-0135ddef6f37` — SUCCESS;
- worker: `324819c6-bdfe-4cf8-a5dc-ea76ad6443da` — SUCCESS.

Prova: pedido de recuperação pelo Supabase respondeu HTTP 200; Resend registrou
`delivered` no evento `87d78d91-d793-4fc3-a6f7-bc6c1a5c3ce2` (2026-09-10 UTC).
O teste não consumiu o token nem alterou a senha do titular. Não equivale a
prova de convite de equipe ou exportação LGPD executados pelo frontend/worker.
O botão foi inspecionado sem exibir seu token: aponta para o domínio canônico,
`/auth/confirm`, com `type=recovery` e `token_hash` presentes.

DMARC criado e resolvido por DNS público em `_dmarc.xgoos.com.br`:
`v=DMARC1; p=none`. É modo inicial sem
quarentena/rejeição. `rua` só deve ser adicionado após confirmar que a caixa de
relatórios existe. A chave utilizada deve ser rotacionada pelo operador após
a exposição no chat; este documento deliberadamente não guarda seu valor.

## Hardening publicado — 2026-09-10

O deployment `a8f1e744-7919-4a2a-968a-358914811290` publicou CSP com nonce,
HSTS, sanitização de respostas 5xx, exigência de MFA no override de plataforma,
allowlist de mídia e remoção de conteúdo de e-mail dos logs. A leitura em
produção confirmou saúde de Supabase/Redis/WAHA e renderização do login sem
erros no navegador. O CAPTCHA não deve ser ativado até existir um widget
Turnstile e as chaves terem sido integradas ao cliente e ao Supabase.

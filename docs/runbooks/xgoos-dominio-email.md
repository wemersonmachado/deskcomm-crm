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

O renderizador versionado é
`hostgator-setup-kit/marca-emails.sh`. Ele aplica os templates e verifica os
marcadores esperados; execute-o somente com `.env` local completo e sem
imprimir seu conteúdo.

## Verificação e manutenção

1. Confirme no Railway que os dois domínios estão `ACTIVE`, verificados e com
   certificado `VALID`.
2. Confirme no Resend que `mail.xgoos.com.br` está `verified`, incluindo DKIM,
   SPF e MX.
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

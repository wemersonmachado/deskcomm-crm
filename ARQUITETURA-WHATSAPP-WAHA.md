# Arquitetura completa da integração WhatsApp com WAHA

> Guia técnico de reconstrução fiel, ponta a ponta, para agentes de código.
>
> Estado documentado: 11 de setembro de 2026, a partir do código-fonte deste repositório.
> Quando houver conflito entre este documento e o código futuro, o código e as migrations
> mais recentes prevalecem.

## 1. Objetivo e regra de fidelidade

Este documento descreve como reconstruir, em outra plataforma, a integração WhatsApp que
existe hoje: provisionamento de sessão WAHA, pareamento por QR, entrada e saída de mensagens,
mídia, identidade, automação por IA, segurança, isolamento multi-tenant, recuperação, retenção
e operação em contêineres.

As marcações usadas são:

- **CONFIRMADO:** comportamento presente no código atual.
- **DEPENDÊNCIA EXTERNA:** requer WAHA, WhatsApp, banco, Storage ou infraestrutura reais.
- **LIMITAÇÃO ATUAL:** comportamento existente que não deve ser confundido com uma garantia.
- **RECOMENDAÇÃO:** endurecimento útil, mas não é descrição do estado atual.

Não copie documentos antigos como fonte executável. Em especial,
`lib/waha/README.md` é um placeholder histórico e `docs/specs/03-spec-whatsapp-waha.md`
contém decisões antigas. Os arquivos listados no mapa de fontes ao final são a referência.

## 2. Visão geral

```text
Administrador
  -> API autenticada do app
     -> reserva transacional no Postgres
        -> API WAHA cria/inicia sessão NOWEB
           -> UI busca QR por proxy autenticado
              -> celular pareia no WhatsApp

WhatsApp
  -> WAHA
     -> webhook interno ou URL pública por token
        -> autenticação e arquivo forense
           -> normalização e deduplicação
              -> contato + conversa + mensagem
                 -> efeitos pós-entrada
                    -> event_log durável
                       -> worker do agente
                          -> ledger de envio
                             -> handler canônico
                                -> WAHA -> WhatsApp

Mídia recebida
  -> URL temporária WAHA
     -> worker baixa com autenticação e proteção SSRF
        -> bucket privado Supabase Storage
           -> URL assinada sob demanda
```

Princípios estruturais:

1. O navegador nunca recebe a chave da API WAHA.
2. O tenant vem da sessão autenticada ou do token do path, nunca do corpo recebido.
3. Toda entidade operacional carrega `organization_id`.
4. A mensagem é persistida antes dos efeitos derivados.
5. Uma saída é registrada antes de chamar o provedor.
6. Mídia durável fica no Storage privado, não na URL efêmera do WAHA.
7. O processamento assíncrono usa eventos persistidos, claim atômico e retentativas.
8. Arquivar um canal impede ingestão e envio, mas preserva o histórico.
9. O modo pré-go-live fecha o envio automatizado por padrão.
10. Falha ambígua de envio não provoca reenvio automático cego.

## 3. Componentes e responsabilidades

| Componente        | Responsabilidade                                                      |
| ----------------- | --------------------------------------------------------------------- |
| Next.js           | APIs autenticadas, proxy de QR/mídia, webhook, Inbox e envio canônico |
| Supabase Postgres | estado multi-tenant, RLS, idempotência, eventos, auditoria e leases   |
| Supabase Auth     | autenticação humana e resolução confiável do tenant                   |
| Supabase Storage  | mídia privada persistente                                             |
| WAHA              | sessão WhatsApp Web, QR, eventos, envio e download de mídia           |
| Redis/Upstash     | rate limit e recursos auxiliares; fallback local não é distribuído    |
| `worker`          | event drain, execução de agentes, persistência de mídia e recuperação |
| `scheduler`       | chamadas cron autenticadas como rede de segurança                     |
| Caddy             | TLS, entrada pública e bloqueio da rota global de webhook             |

O engine padrão é **NOWEB** e a imagem de produção confirmada é
`devlikeapro/waha:latest-2026.7.2`, substituível por `WAHA_IMAGE`.

## 4. Variáveis de ambiente

Nunca escreva valores reais neste documento, no Git ou em logs. O app usa a chave WAHA em
texto puro para chamar a API; o contêiner WAHA recebe somente o hash SHA-512 prefixado.

| Variável                          | Consumidor        | Finalidade                                             |
| --------------------------------- | ----------------- | ------------------------------------------------------ |
| `WAHA_API_BASE_URL`               | app/worker        | base interna da API, normalmente `http://waha:3000`    |
| `WAHA_API_KEY`                    | app/worker        | plaintext enviado em `X-Api-Key`; segredo server-side  |
| `WAHA_API_KEY_SHA512`             | contêiner WAHA    | digest hexadecimal configurado como `sha512:<digest>`  |
| `WAHA_BYO_ENCRYPTION_KEY`         | app/banco         | chave da infraestrutura de criptografia de credenciais |
| `WAHA_HMAC_SECRET`                | WAHA/app          | segredo de assinatura quando o emissor suporta HMAC    |
| `WAHA_WEBHOOK_REQUIRE_SIGNATURE`  | app               | `true` exige assinatura; padrão atual é `false`        |
| `WAHA_WEBHOOK_BASE_URL`           | WAHA              | base usada para montar o webhook global                |
| `WHATSAPP_RESTART_ALL_SESSIONS`   | WAHA              | reinicia sessões persistidas; produção usa `True`      |
| `INTERNAL_SECRET`                 | serviços internos | autenticação interna e fallback de crons               |
| `INTERNAL_CRON_SECRET`            | scheduler/app     | bearer específico dos crons                            |
| `WEBHOOK_LOG_BODY_RETENTION_DAYS` | cron              | dias para manter corpo pesado; padrão 7                |
| `WEBHOOK_LOG_ROW_RETENTION_DAYS`  | cron              | dias para manter índice forense; padrão 90             |

Geração conceitual:

```text
WAHA_API_KEY = segredo aleatório de alta entropia
WAHA_API_KEY_SHA512 = hex(SHA-512(WAHA_API_KEY))
WAHA recebe: WAHA_API_KEY="sha512:<WAHA_API_KEY_SHA512>"
cliente envia: X-Api-Key: <WAHA_API_KEY>
```

Não use a API key em query string. Não exponha o dashboard WAHA em produção.

### 4.1 URL correta do webhook por topologia

Na instalação Docker deste projeto, WAHA e app compartilham rede interna:

```dotenv
WAHA_WEBHOOK_BASE_URL=http://app:3000
```

O contêiner monta:

```text
http://app:3000/api/v1/webhooks/waha
```

O Caddy bloqueia publicamente a rota global exata. Isso reduz sua superfície. Se WAHA estiver
em outra máquina, configure uma rota pública por canal (`/api/v1/webhooks/waha/<token>`) ou um
proxy autenticado/assinador. Não publique a rota global sem uma fronteira equivalente.

## 5. Modelo de dados mínimo

### 5.1 `channel_sessions`

Representa um número/provedor de uma organização. Campos essenciais:

- identidade: `id`, `organization_id`, `provider`, `engine`;
- transporte: `waha_session_name`, `phone_number`, `display_name`;
- webhook: `webhook_path_token`, `webhook_secret_encrypted`;
- estado: `status`, `status_reason`, `last_status_change_at`,
  `last_health_check_at`, `consecutive_health_fails`;
- segurança operacional: `metadata`, `archived_at`;
- pacing: `daily_message_limit`, `warmup_started_at`, `warmup_completed_at`,
  `is_warmup_complete`;
- auditoria: `created_by`, `created_at`, `updated_at`.

O nome de sessão atual é curto para respeitar o limite WAHA:

```text
org_<16 caracteres do UUID da organização sem hífens>_<20 caracteres aleatórios>
```

Total: 41 caracteres. `webhook_path_token` deve ser aleatório e único globalmente. O segredo
do webhook é cifrado no banco por RPC; nunca armazenado em texto puro.

### 5.2 `channel_connection_requests`

Coordena criação idempotente e concorrência:

- chave UUID de idempotência;
- hash do pedido;
- `channel_session_id`;
- estado da operação;
- `lease_token` e expiração;
- checkpoints de criação remota/finalização.

A tabela não é uma API pública. A reserva é RPC para `authenticated`; a conclusão, apenas
`service_role`. O lease atual evita duas criações simultâneas e expira em cinco minutos.

### 5.3 `contacts`, `conversations` e `messages`

`contacts` mantém identidade normalizada por organização, telefone E.164, `wa_lid`, nome e
bloqueio. Há unicidade tenant-aware para identidades ativas.

`conversations` une organização, contato e canal; guarda estado, não lidos, atribuição,
atividade e silêncio temporário da IA.

`messages` guarda organização, conversa, canal, contato, direção, tipo, corpo, status, ACK,
erro, IDs externos, resposta relacionada, timestamps de edição/revogação, mídia e origem do
envio. A deduplicação principal é:

```sql
unique (organization_id, external_id)
```

### 5.4 `webhook_events_log` e `event_log`

`webhook_events_log` é o arquivo forense de entrada. Nasce antes do processamento e guarda
headers sanitizados, corpo cru, JSON, assinatura, evento, ID externo, status e tentativas.

`event_log` é a fila durável de domínio. Eventos são reivindicados com compare-and-swap para
que somente um consumidor execute cada unidade de trabalho.

### 5.5 RLS e service role

Ative RLS em todas as tabelas tenant-aware. Políticas humanas devem permitir apenas
`organization_id in (fn_user_org_ids())`, com elevação explícita de administrador quando
necessária. Como `service_role` ignora RLS, cada query administrativa deve incluir filtro
explícito por `organization_id` obtido de fonte confiável.

## 6. Provisionamento de uma conexão

### 6.1 Endpoint normal

```http
POST /api/v1/channel-sessions
Idempotency-Key: <UUID>
Content-Type: application/json
```

Requisitos atuais: usuário autenticado, papel admin, MFA satisfeito quando exigido, permissão
de escrita no modo de suporte, body validado por Zod e WAHA configurado.

### 6.2 Endpoint do onboarding

```http
POST /api/v1/onboarding/whatsapp/session
```

Usa o mesmo núcleo, com `onboarding:true`. O GET correspondente consulta o canal de onboarding,
lê o estado vivo no WAHA e sincroniza o banco.

### 6.3 Algoritmo transacional

1. Exigir `Idempotency-Key` UUID.
2. Validar `{display_name, onboarding, restart}`.
3. Calcular SHA-256 canônico do pedido.
4. Chamar `fn_reserve_channel_connection(p_org, p_key, p_hash, ...)`.
5. Se for replay, devolver o canal já associado.
6. Se outra operação possuir o lease, devolver conflito/retry, não criar outra sessão.
7. Criar a sessão remota com `POST /api/sessions`, `start:false` e configuração `ignore`.
8. Registrar checkpoint `remote_created`.
9. Iniciar com `POST /api/sessions/{name}/start`.
10. Confirmar por `GET /api/sessions/{name}` que nome e estado são os esperados.
11. Finalizar por `fn_finish_channel_connection`, usando `service_role` e `lease_token`.
12. Auditar `channel.connected` ou `channel.reactivated`.

Em erro depois da criação remota, marque `FAILED`/`connection_repair_required`. Não apague a
sessão automaticamente: uma tentativa posterior pode reconciliar um efeito remoto já ocorrido.

Estados transitórios aceitos durante conexão: `STARTING`, `SCAN_QR_CODE`, `WORKING`. Outros,
como `STOPPED` e `FAILED`, exigem tratamento explícito.

## 7. API WAHA usada

Todas as chamadas enviam `X-Api-Key` e têm timeout. O padrão é 15 s; mídia usa 30 s.

| Operação         | Método e caminho                                              |
| ---------------- | ------------------------------------------------------------- |
| versão           | `GET /api/server/version`                                     |
| criar sessão     | `POST /api/sessions`                                          |
| consultar sessão | `GET /api/sessions/{name}`                                    |
| atualizar config | `PUT /api/sessions/{name}`                                    |
| iniciar          | `POST /api/sessions/{name}/start`                             |
| parar            | `POST /api/sessions/{name}/stop`                              |
| logout           | `POST /api/sessions/{name}/logout`                            |
| apagar remota    | `DELETE /api/sessions/{name}`                                 |
| QR               | `GET /api/{name}/auth/qr?format=image`                        |
| foto             | `GET /api/contacts/profile-picture?session=...&contactId=...` |
| resolver LID     | `GET /api/{name}/lids/{lid}`                                  |
| checar telefone  | `GET /api/contacts/check-exists?...`                          |
| texto            | `POST /api/sendText`                                          |
| vCard            | `POST /api/sendContactVcard`                                  |
| imagem           | `POST /api/sendImage`                                         |
| vídeo            | `POST /api/sendVideo` com `convert:true`                      |
| áudio/voz        | `POST /api/sendVoice` com `convert:true`                      |
| documento        | `POST /api/sendFile`                                          |

Ao atualizar a sessão, faça primeiro GET, mescle a configuração e só então PUT. Nunca substitua
o objeto inteiro sem preservar webhooks e outros campos já existentes.

A configuração `ignore` aplicada é:

```json
{
  "status": true,
  "broadcast": true,
  "channels": true,
  "groups": true
}
```

## 8. Pareamento por QR

O browser chama uma rota same-origin autenticada:

```text
GET /api/v1/channel-sessions/{id}/qr
GET /api/v1/onboarding/whatsapp/qr
```

O servidor:

1. autentica o usuário;
2. resolve a organização;
3. busca o canal filtrado por `organization_id`;
4. rejeita canal arquivado ou oficial sem sessão WAHA;
5. chama WAHA com a API key server-side;
6. transmite os bytes e o `Content-Type` da imagem;
7. envia `Cache-Control: no-store`.

Nunca aponte `<img>` diretamente ao WAHA e nunca incorpore a API key na URL.

## 9. Webhook: topologias e autenticação

Existem duas entradas:

```text
POST /api/v1/webhooks/waha
POST /api/v1/webhooks/waha/{webhook_path_token}
```

A global resolve o tenant por `body.session` e deve ficar dentro da rede privada. Sessão
desconhecida recebe resposta neutra para evitar tempestade de retry. A rota por token resolve
uma única sessão ativa e é adequada à borda pública.

### 9.1 Contrato em duas etapas

1. Leia o corpo como texto, sem alterar bytes.
2. Faça parse tolerante apenas dos campos de roteamento: evento, sessão e ID.
3. Resolva o canal e rejeite arquivado antes de efeitos.
4. Abra a linha do arquivo forense.
5. Verifique assinatura sobre os bytes crus.
6. Valide com Zod os campos efetivamente consumidos.
7. Despache o evento normalizado.
8. Feche o arquivo como `processed` ou `error`.

Schemas devem aceitar campos desconhecidos do WAHA, mas tipar estritamente tudo que a lógica
usa. Isso tolera evolução do provedor sem tornar os campos críticos `any`.

### 9.2 HMAC

Algoritmo confirmado:

```text
esperado = HMAC-SHA512(secret, raw UTF-8 body), hexadecimal
recebido = header de assinatura, aceitando prefixo opcional "sha512="
comparação = timingSafeEqual(bytes esperado, bytes recebido)
```

Uma assinatura presente e inválida é sempre rejeitada. Se
`WAHA_WEBHOOK_REQUIRE_SIGNATURE=true`, ausência também é rejeitada e a aplicação deve falhar
fechada quando o segredo não existe.

**LIMITAÇÃO ATUAL:** WAHA Core 2026.7.2 foi medido sem emitir assinatura mesmo com HMAC
configurado. Por isso o padrão do projeto é `false`, protegido pela rede interna e/ou token
imprevisível no path. Para assinatura obrigatória, use edição que assine ou um proxy assinador
e só depois altere a flag.

### 9.3 Arquivo forense e privacidade

Nunca grave `Authorization`, `Cookie` ou `X-Api-Key`. O arquivo nasce antes do handler para
sobreviver a crash no meio da ingestão. A assinatura pode ser preservada porque não concede
acesso sozinha.

O cron de retenção, em lotes de 500 a cada cinco minutos:

- após 7 dias por padrão: zera `raw_body`, `payload_parsed` e `headers`, marca `archived_at`;
- após 90 dias por padrão: apaga a linha forense;
- preserva durante o intervalo o índice leve de evento, status e assinatura.

## 10. Eventos inscritos e roteamento

O WAHA de produção publica:

```text
message.any,message.ack,message.edited,message.revoked,session.status,state.change
```

O dispatcher trata:

| Evento                          | Ação                                          |
| ------------------------------- | --------------------------------------------- |
| `message`/`message.any`         | entrada do cliente ou mensagem `fromMe`       |
| `message.ack`                   | atualiza ACK, enviado, entregue ou lido       |
| `message.edited`                | atualiza corpo e `edited_at` pelo ID original |
| `message.revoked`               | marca `revoked_at`; não apaga o histórico     |
| `session.status`/`state.change` | sincroniza estado, warmup e alerta de saúde   |

Exija pelo menos `session` e o ID do evento/mensagem necessários ao roteamento. Não confie em
`organization_id` enviado pelo provedor.

## 11. Identidade WhatsApp

O parser deve distinguir:

- `@c.us` e `@s.whatsapp.net`: telefone normalizável para E.164;
- `@lid`: identidade opaca atual do WhatsApp; persistir como `wa_lid`;
- `@g.us`: grupo, ignorado pelo produto atual;
- qualquer sufixo desconhecido: descartar e emitir anomalia observável.

Para `@lid`, tente obter telefone alternativo validado em
`_data.key.remoteJidAlt` ou `participantAlt`. Se necessário e suportado, consulte
`GET /api/{session}/lids/{lid}`. Não invente número a partir do LID.

Upserts críticos devem ser atômicos no banco:

- `fn_upsert_wa_contact`;
- `fn_upsert_wa_conversation`;
- `fn_mark_conversation_message`.

## 12. Ingestão de mensagens

### 12.1 Entrada do cliente

1. Parsear identidade; ignorar grupo e hosts desconhecidos.
2. Normalizar nome, corpo, tipo, MIME e URL de mídia.
3. Upsert do contato dentro da organização.
4. Upsert da conversa vinculada ao canal.
5. Inserir mensagem `inbound`, `delivered`, `sent_via=external_device`.
6. Em conflito `(organization_id, external_id)`, tratar como duplicata bem-sucedida.
7. Atualizar contador/preview da conversa por RPC.
8. Auditar `message.received`.
9. Executar efeitos pós-entrada na ordem definida.
10. Se houver mídia, emitir `media.persist_requested`.

O tipo deve ser inferido tanto do campo superior quanto das estruturas NOWEB aninhadas, com
fallback pelo MIME. Tipos relevantes incluem texto, áudio, imagem, vídeo, documento, sticker,
localização, contato e reação.

Uma duplicata não deve criar outra mensagem nem outro atendimento do agente. O pipeline pode
ser reacelerado de forma idempotente para recuperar trabalho pendente.

### 12.2 Mensagem enviada pelo próprio telefone (`fromMe`)

Use a precedência `to`, ID composto e depois `from` para achar o chat remoto. Procure eco pelos
IDs externos em forma completa, bare e composta.

Se for uma resposta humana real no celular:

- persista como outbound `sent_via=external_device`;
- pause temporariamente a IA daquela conversa;
- não gere nova resposta automática.

Existe uma heurística forte de 60 segundos para identificar eco de mensagem que o próprio app
acabou de enviar. Sem ela, o eco do bot seria interpretado como intervenção humana.

## 13. Efeitos pós-entrada

A ordem atual é parte do contrato:

1. detectar opt-out e bloquear o contato;
2. garantir lead no funil, exceto se bloqueado;
3. avaliar autorização de campanha;
4. acelerar pipeline de eventos/follow-up;
5. emitir `ai_agent.dispatch_requested`.

Essas etapas são fail-low: a mensagem já persistida não é perdida porque um efeito secundário
falhou. O detector de opt-out é compartilhado, sensível a intenção em PT/ES e evita falsos
positivos como “parar a dor”. Um comando inequívoco de cessação impede novos envios.

## 14. Execução do agente de IA

O único motor consumidor é `workers/agent-worker/main.ts`. A rota antiga
`/api/v1/cron/agent-dispatcher` é um no-op autenticado mantido por compatibilidade.

Fluxo durável:

1. claim atômico do `event_log`: `pending -> processing`;
2. registrar consumidor, tentativas e dead letter quando excedidas;
3. criar `inbound_turn` único por organização e evento fonte;
4. aplicar debounce a rajadas do mesmo contato;
5. ignorar grupos;
6. se a organização estiver em execução externa, não rodar o engine interno;
7. aguardar derivação de mídia por tempo limitado;
8. montar contexto, RAG, guardrails e ferramentas;
9. executar LLM;
10. registrar cada saída em ledger `(job_id, sequence)`;
11. chamar o handler canônico de mensagens.

Nenhuma resposta bruta do modelo chama WAHA diretamente. Essa fronteira concentra pacing,
autoridade, opt-out, canal, idempotência, auditoria e estado de entrega.

## 15. Envio canônico

Entrada humana:

```http
POST /api/v1/messages
Content-Type: application/json
```

O schema aceita `conversation_id`, tipo, corpo de até 4096 caracteres, mídia, MIME, tamanho,
metadados, template e `reply_to_message_id`. Deve existir conteúdo válido para o tipo.

Algoritmo:

1. autenticar papel `agent` ou superior;
2. buscar conversa, contato e canal com filtro de organização;
3. falhar se contato estiver bloqueado;
4. validar que mídia começa com `{org}/{conversation}/`;
5. validar que reply pertence à mesma organização e conversa;
6. inserir outbound em `queued` antes do transporte;
7. resolver o adapter do provedor;
8. resolver destinatário: grupo, depois LID, depois telefone em `@c.us`;
9. para origem IA, revalidar pré-go-live no último instante;
10. impedir envio por canal arquivado;
11. manter `queued` se credencial/canal ainda não estiver operacional;
12. enviar texto, vCard ou mídia;
13. persistir ID externo e estado `sent`;
14. atualizar conversa/contato, auditoria e eventos;
15. em resposta humana, silenciar IA por cinco minutos.

O adapter WAHA retorna IDs equivalentes para conciliar o eco:

```text
external_id
bare_id
true_<recipient>_<bare_id>
```

Resposta encadeada é suportada no envio de texto. Para outros tipos, só declare suporte depois
de implementar e testar explicitamente.

## 16. Mídia

### 16.1 Upload de saída

Rota:

```text
POST /api/v1/conversations/{id}/media
multipart/form-data, campo file
```

Controles obrigatórios atuais:

- autenticação e organização;
- limite antecipado por `Content-Length` e posterior por `file.size`;
- máximo de 50 MB;
- allowlist MIME explícita;
- SVG e HTML proibidos;
- bucket privado `whatsapp-media`;
- path `{organization_id}/{conversation_id}/out-<uuid>.<ext>`.

Áudio WebM do navegador pode ser convertido de forma best-effort para voz compatível.

### 16.2 Persistência da entrada

O webhook grava inicialmente a URL temporária. O worker:

1. recebe `media.persist_requested`;
2. resolve o adapter/canal da organização;
3. extrai somente path e query da URL anunciada;
4. reconstrói a URL sobre `WAHA_API_BASE_URL`, evitando SSRF para host arbitrário;
5. baixa com `X-Api-Key`, timeout 30 s e limite 50 MB antes/depois;
6. grava no bucket privado em `{org}/{conversation}/{message}.{ext}`;
7. registra path, MIME, tamanho e status;
8. emite evento de derivação/transcrição;
9. tenta drenar até cinco vezes; na última, marca falha.

### 16.3 Leitura e envio

`GET /api/v1/messages/{id}/media` autentica e filtra por tenant. Se já persistida, redireciona
para URL assinada de uma hora; se ainda temporária, faz proxy same-origin pelo adapter.

Para enviar, gere URL assinada do Storage por 600 segundos e entregue a URL ao WAHA. Não mande
base64 entre app e WAHA.

## 17. Pré-go-live, pacing e proteção operacional

Todo canal novo nasce fechado para automação:

```json
{
  "ai_gate": "allowlist",
  "ai_gate_mode": "pre_go_live",
  "ai_test_phone_numbers": []
}
```

Admin gerencia isso por `GET/PATCH /api/v1/channel-sessions/{id}/ai-access`. A alteração é
atômica por `fn_configurar_pre_go_live_canal`; números de teste são normalizados para E.164.

O sink de envio revalida a regra. Não basta esconder um botão na UI.

Pacing confirmado:

- intervalo-base 1200 ms;
- jitter de 0 a 800 ms;
- janela local padrão 07:00–22:00, domingo permitido;
- warmup: dia 0 = 20, dia 4 = 50, dia 8 = 100, dia 15 = 200, dia 31 = sem teto de warmup;
- limite absoluto diário vem do canal, padrão 300.

Ordem: janela permitida, cap de warmup/diário, throttle+jitter. Desativar `banRisk` não desliga
a janela de cortesia. Overrides por canal vivem em `channel_knobs`, com timezone padrão
`America/Sao_Paulo`.

**LIMITAÇÃO ATUAL:** a tabela legada `channel_session_warmup` não é a fonte ativa do contador
do engine moderno. Não a replique como se fosse o ledger atual.

## 18. Saúde, reconexão e exclusão

### 18.1 Reconectar

```http
POST /api/v1/channel-sessions/{id}/reconnect
```

- padrão: stop + start, preservando credenciais;
- `{ "force": true }`: stop + logout + start, exigindo novo QR.

Exige admin, MFA, canal não arquivado e lease livre. Falha sincroniza `FAILED`; sucesso é
confirmado por leitura da sessão e auditado.

### 18.2 Health check

`/api/v1/cron/channel-health` roda a cada cinco minutos, autenticado por bearer interno.
Consulta no máximo um lote, sincroniza estado e emite um único alerta por episódio. Recuperação
resolve o alerta. O polling não reinicia automaticamente todas as falhas.

O watchdog do worker pode reiniciar somente `STOPPED`; não reinicia `FAILED` nem
`SCAN_QR_CODE`, pois isso poderia mascarar credencial inválida ou pareamento necessário.

### 18.3 Mensagens presas

`/api/v1/cron/recover-stuck-messages` roda a cada minuto. Outbound em `sending` por mais de
cinco minutos vira `failed/send_timeout`, gera evento e alerta. Não há reenvio automático porque
o provedor pode ter aceitado a mensagem antes da queda da resposta. Mensagens `queued` possuem
fluxo próprio de redrive.

### 18.4 Remover canal

Antes de remover, calcule impacto real de FKs e configuração:

- canal virgem: revogue logout/sessão no WAHA e apague a linha;
- canal com histórico/configuração: revogue transporte e marque `archived_at`.

Arquivado deve desaparecer da seleção ativa e ser bloqueado na entrada e saída. Preservar
mensagens e configurações é necessário para integridade e auditoria. A revogação remota ocorre
primeiro e falha fechada se o WAHA não estiver disponível.

## 19. Implantação Docker

Topologia de produção:

```text
Internet -> Caddy (80/443)
                -> app:3000
app/worker <-> Supabase
app/worker -> waha:3000
waha -> app:3000/api/v1/webhooks/waha
scheduler -> app:3000/api/v1/cron/*
```

Somente Caddy publica portas. WAHA, app, worker, Redis, scheduler e serviços auxiliares ficam
na rede interna.

Configuração WAHA essencial no Compose:

```yaml
image: ${WAHA_IMAGE:-devlikeapro/waha:latest-2026.7.2}
environment:
  WAHA_API_KEY: "sha512:${WAHA_API_KEY_SHA512}"
  WHATSAPP_HOOK_URL: ${WAHA_WEBHOOK_BASE_URL}/api/v1/webhooks/waha
  WHATSAPP_HOOK_EVENTS: "message.any,message.ack,message.edited,message.revoked,session.status,state.change"
  WHATSAPP_HOOK_HMAC: ${WAHA_HMAC_SECRET}
  WHATSAPP_DEFAULT_ENGINE: NOWEB
  WHATSAPP_RESTART_ALL_SESSIONS: "True"
  WAHA_DASHBOARD_ENABLED: "false"
volumes:
  - waha-data:/app/.sessions
  - waha-media:/app/.media
```

`waha-data` é crítico: perdê-lo exige novo pareamento. Faça backup/restore compatível e nunca
recrie o volume numa atualização normal. Limite e rotacione logs; o projeto usa 10 MB × 3.

Na VPS com proxy reverso, sempre suba também o compose de labels:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d app
```

## 20. Segurança obrigatória para uma recriação

Checklist mínimo:

- [ ] TLS público e redirecionamento HTTP -> HTTPS.
- [ ] WAHA inacessível diretamente pela internet.
- [ ] dashboard WAHA desabilitado em produção.
- [ ] API key aleatória; plaintext somente nos consumidores server-side.
- [ ] hash SHA-512 no contêiner WAHA.
- [ ] webhook global privado ou rota pública com token aleatório por canal.
- [ ] HMAC obrigatório apenas quando o emissor realmente assina.
- [ ] comparação HMAC constant-time sobre corpo cru.
- [ ] headers sensíveis removidos do arquivo forense.
- [ ] retenção de payloads e mídia configurada.
- [ ] Auth server-side via usuário revalidado, RBAC e MFA em mutações administrativas.
- [ ] tenant derivado de fonte confiável e `organization_id` em todas as queries service-role.
- [ ] RLS e índices/constraints tenant-aware.
- [ ] Zod na borda e payloads com tamanho máximo.
- [ ] mídia com MIME allowlist, limite de bytes, bucket privado e proteção SSRF.
- [ ] opt-out revalidado antes do envio.
- [ ] pré-go-live revalidado no sink.
- [ ] idempotência de criação e deduplicação de mensagens.
- [ ] logs sem token, telefone, e-mail ou corpo desnecessário.
- [ ] auditoria de mutações e alertas sem duplicação por episódio.

## 21. Contratos de falha

Uma implementação equivalente deve manter estes comportamentos:

| Falha                                 | Resultado seguro                                          |
| ------------------------------------- | --------------------------------------------------------- |
| WAHA não configurado                  | 503; não criar estado parcialmente utilizável             |
| criação remota ambígua                | marcar reparo; reconciliar, não duplicar/apagar cegamente |
| QR de outro tenant                    | 404/403 sem revelar existência                            |
| assinatura presente inválida          | rejeitar                                                  |
| canal arquivado                       | não ingerir e não enviar                                  |
| contato opt-out/bloqueado             | falhar antes do transporte                                |
| mídia fora do prefixo tenant/conversa | rejeitar                                                  |
| reply de outra conversa               | rejeitar                                                  |
| evento duplicado                      | sucesso idempotente, uma mensagem                         |
| erro de efeito pós-entrada            | preservar mensagem e deixar rastros recuperáveis          |
| timeout depois de chamar provedor     | não reenviar automaticamente                              |
| download de mídia em host arbitrário  | reconstruir sobre base WAHA ou rejeitar                   |

**LIMITAÇÃO ATUAL:** as rotas WAHA atuais arquivam o corpo antes do dispatch, mas capturam uma
exceção de dispatch e ainda respondem 200. O arquivo permite investigação, porém um clone mais
robusto deve persistir o estado de erro e redrive durável sem causar duplicata. Não mude isso
sem teste de idempotência e tempestade de retries.

## 22. Plano de implementação em outra plataforma

Execute nesta ordem; cada fase depende da anterior:

### Fase A — fundação

1. Criar tabelas, constraints, RLS e RPCs atômicas.
2. Criar clientes DB humano e administrativo separados.
3. Implementar criptografia de segredo e auditoria.
4. Subir WAHA isolado com volume persistente.
5. Implementar cliente WAHA com timeout e erros sanitizados.

### Fase B — ciclo da sessão

1. Implementar reserva/idempotência/lease.
2. Criar, iniciar e confirmar sessão.
3. Implementar proxy de QR.
4. Sincronizar estados e telefone somente a partir da sessão verificada.
5. Implementar reconnect normal/forçado e remoção segura.

### Fase C — entrada

1. Implementar rota privada global ou pública por token.
2. Arquivar payload antes do processamento.
3. Implementar assinatura e contrato em duas etapas.
4. Implementar parser de `@c.us`, `@s.whatsapp.net`, `@lid` e grupos.
5. Implementar upserts atômicos e deduplicação.
6. Implementar ACK, edição, revogação e status.
7. Implementar efeitos pós-entrada e fila durável.

### Fase D — saída e IA

1. Implementar handler canônico com mensagem `queued` antes do transporte.
2. Implementar adapter WAHA para texto, mídia e vCard.
3. Implementar conciliação de eco e ACK.
4. Implementar opt-out, pré-go-live, pacing e limites.
5. Conectar engine interno ou externo somente ao handler canônico.
6. Implementar send ledger e recuperação de crash.

### Fase E — mídia e operação

1. Criar bucket privado e upload validado.
2. Implementar persistência inbound com SSRF guard.
3. Implementar proxy/URL assinada para leitura.
4. Configurar health, watchdog, stuck messages e retenção.
5. Executar testes locais, banco real efêmero, browser e aparelho real.

## 23. Validação ponta a ponta

### 23.1 Gates automatizados deste repositório

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:db
pnpm test:e2e
pnpm test:shell
```

`pnpm gov:verify` cobre typecheck, lint e unitários; não cobre banco nem E2E.

Testes de referência:

- cliente/provisionamento: `lib/waha/client.test.ts`, `lib/channels/connect-waha.test.ts`;
- assinatura/contrato: `lib/waha/webhook-auth.test.ts`,
  `tests/unit/contrato-do-webhook-waha.test.ts`;
- ingestão/identidade: `lib/waha/ingest-celular.test.ts`, `tests/unit/waha-ingest-*`;
- mídia: `tests/unit/waha-ingest-media.test.ts`, `tests/unit/waha-media-send.test.ts`,
  `tests/unit/media-waha-source.test.ts`, `tests/unit/media-persist-worker.test.ts`;
- segurança de upload: `tests/unit/media-upload-validation.test.ts`;
- opt-out/pacing: `tests/unit/opt-out-deteccao.test.ts` e testes `pre-go-live`;
- recuperação: `tests/unit/channel-health-aviso.test.ts`,
  `tests/unit/recover-stuck-messages.test.ts`;
- banco: `tests/invariants/pre-go-live-canal.test.ts`,
  `tests/invariants/pre-go-live-reservation.test.ts`,
  `tests/invariants/automation-send-whatsapp.test.ts`;
- browser: `tests/e2e/pre-go-live-whatsapp.spec.ts`.

`tests/e2e/vps-fresh-onboarding.spec.ts` é P0, mas está fora do CI atual por depender de WAHA,
Redis, Resend e serviços de instalação. Rode-o manualmente sempre que mudar empacotamento,
onboarding ou conexão.

### 23.2 Prova real obrigatória

Mocks e HTTP 200 não provam WhatsApp ponta a ponta. Em ambiente autorizado, use número de
teste e contato consentido:

1. instalar do zero em host limpo;
2. abrir UI, criar canal e comprovar que segunda chamada idempotente não duplica;
3. ler QR pela rota same-origin e parear;
4. confirmar `WORKING`, telefone e persistência após restart dos contêineres;
5. receber texto real e conferir webhook, contato, conversa, mensagem e Inbox;
6. repetir o mesmo webhook e confirmar uma única mensagem;
7. receber mídia e verificar Storage privado e leitura autorizada;
8. receber `@lid` e verificar identidade sem inventar telefone;
9. enviar texto pela UI e confirmar no aparelho, ID externo e ACK entregue/lido;
10. enviar imagem, áudio, vídeo, documento, vCard e reply onde suportado;
11. enviar pelo celular e confirmar persistência `fromMe` e pausa da IA;
12. testar opt-out e provar que novo outbound é bloqueado;
13. testar pré-go-live: não autorizado bloqueado, allowlist permitido, modo aberto permitido;
14. derrubar WAHA, confirmar alerta único, recuperar e confirmar resolução;
15. forçar timeout ambíguo e provar ausência de reenvio duplicado;
16. reiniciar app/worker/WAHA e provar recuperação da sessão pelo volume;
17. tentar acesso cross-tenant a canal, QR, mensagem e mídia;
18. arquivar/remover o canal e provar que entrada e saída deixam de operar.

Registre IDs técnicos e timestamps, mas masque telefones e nunca capture tokens ou conteúdo
real desnecessário na evidência.

## 24. Critério objetivo de aceite

A recriação só pode ser chamada de funcional quando:

- criação é idempotente e recuperável;
- QR nunca expõe segredo;
- sessão sobrevive a restart;
- entrada, deduplicação, ACK, edição e revogação funcionam;
- identidades telefônicas e LID não se misturam;
- saída passa por um único sink seguro;
- opt-out e pré-go-live bloqueiam no backend;
- mídia é privada, limitada, persistida e tenant-aware;
- IA não duplica saída após crash;
- canal arquivado não processa tráfego;
- RLS/cross-tenant passam no banco real;
- a jornada foi comprovada com WhatsApp real e contato consentido.

## 25. Mapa fiel de fontes no repositório

| Assunto                     | Fonte principal                                           |
| --------------------------- | --------------------------------------------------------- |
| cliente e contrato WAHA     | `lib/waha/client.ts`                                      |
| provisionamento idempotente | `lib/channels/connect-waha.ts`                            |
| API de canais               | `app/api/v1/channel-sessions/route.ts`                    |
| health/exclusão             | `app/api/v1/channel-sessions/[id]/route.ts`               |
| reconexão                   | `app/api/v1/channel-sessions/[id]/reconnect/route.ts`     |
| QR                          | `app/api/v1/channel-sessions/[id]/qr/route.ts`            |
| acesso da IA                | `app/api/v1/channel-sessions/[id]/ai-access/route.ts`     |
| onboarding                  | `app/api/v1/onboarding/whatsapp/`                         |
| webhook global              | `app/api/v1/webhooks/waha/route.ts`                       |
| webhook por token           | `app/api/v1/webhooks/waha/[token]/route.ts`               |
| autenticação HMAC           | `lib/waha/webhook-auth.ts`                                |
| schema de envelope          | `lib/waha/envelope.ts`                                    |
| ingestão                    | `lib/waha/ingest.ts`                                      |
| arquivo forense             | `lib/channels/arquivo-de-webhook.ts`                      |
| retenção do arquivo         | `lib/channels/retencao-do-arquivo.ts`                     |
| efeitos pós-entrada         | `lib/channels/pos-entrada.ts`                             |
| opt-out                     | `lib/opt-out/deteccao.ts`                                 |
| handler de saída            | `app/api/v1/messages/_handler.ts`                         |
| rota de saída               | `app/api/v1/messages/route.ts`                            |
| adapter WAHA                | `lib/channels/adapters/waha.ts`                           |
| payload de mídia WAHA       | `lib/waha/media-send.ts`                                  |
| upload de mídia             | `app/api/v1/conversations/[id]/media/route.ts`            |
| leitura de mídia            | `app/api/v1/messages/[id]/media/route.ts`                 |
| worker de mídia             | `workers/media-persist-worker.ts`                         |
| engine do agente            | `workers/agent-worker/main.ts`                            |
| drain/claim                 | `lib/agent-engine/edge/crm/drain.ts`                      |
| ledger da IA                | `lib/agent-engine/edge/crm/send-message.ts`               |
| pacing                      | `lib/agent-engine/pacing/defaults.ts`                     |
| saúde                       | `app/api/v1/cron/channel-health/route.ts`                 |
| mensagens presas            | `app/api/v1/cron/recover-stuck-messages/route.ts`         |
| agenda dos crons            | `docker/scheduler/entrypoint.sh`                          |
| produção                    | `docker-compose.prod.yml`, `Caddyfile`                    |
| schema instalável           | `supabase/baseline.sql`                                   |
| evolução do schema          | `supabase/migrations/`, `supabase/migrations/MANIFEST.md` |
| variáveis                   | `lib/env.ts`, `.env.example`                              |

## 26. Prompt curto para entregar a outro agente

```text
Reconstrua a integração WhatsApp seguindo ARQUITETURA-WHATSAPP-WAHA.md.
Leia primeiro as fontes da seção 25 e trate o código/migrations mais recentes como
autoridade. Implemente na ordem da seção 22. Não exponha chaves, não derive tenant do
payload, não envie diretamente do LLM e não declare E2E com mocks. Preserve idempotência,
RLS, pré-go-live, opt-out, ledger de envio, mídia privada e volume de sessão. Ao terminar,
execute os gates da seção 23 e apresente evidência mascarada do teste com aparelho real.
```

Esse prompt não substitui o documento: ele apenas orienta um agente a lê-lo e executar a
reconstrução sem omitir as fronteiras críticas.

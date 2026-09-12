# Asaas — cobrança por planos

## Estado e fonte de verdade

- Cada plano possui um link mensal próprio. O cliente nunca escolhe o valor.
- O superadministrador altera o preço em **Configurações da landing page** e usa **Salvar e publicar**.
- A publicação atualiza o mesmo link no Asaas e só depois grava a landing. Assim, o preço exibido e o checkout convergem.
- Os identificadores públicos dos links ficam em `platform_billing_plans`; a chave da API e o token do webhook ficam apenas no `.env`/Railway.

## Variáveis

`ASAAS_API_KEY`, `ASAAS_API_BASE_URL` e `ASAAS_WEBHOOK_TOKEN`. Nunca registrar valores em documentação, logs ou Git.

## Webhook

Endpoint: `POST /api/v1/webhooks/asaas`. O header `asaas-access-token` é obrigatório e comparado em tempo constante. `event_id` é chave única: reentregas são idempotentes. O payload persistido é minimizado e não contém nome, CPF, e-mail ou endereço do pagador.

Eventos aceitos são registrados em `platform_payment_events`. Apenas `PAYMENT_CONFIRMED` e
`PAYMENT_RECEIVED`, associados a um link ativo e com valor idêntico ao plano publicado,
podem provisionar acesso. O app relê nome e e-mail em `GET /customers/{id}` no Asaas,
cria organização e assinatura uma única vez e envia pelo Resend o link assinado para o
pagador criar a própria senha. O e-mail aberto não é persistido na tabela financeira;
`platform_checkout_access` guarda apenas SHA-256 e o recibo idempotente.

Renovações da mesma assinatura reutilizam a organização. Retentativas do webhook reutilizam
o mesmo convite e a mesma chave de idempotência no Resend, sem duplicar tenant nem mensagem.

## Operação

1. Confirme que `https://xgoos.com.br/api/v1/webhooks/asaas` está publicado.
2. Cadastre o webhook no Asaas com o token da instalação.
3. Publique os preços na landing e abra cada checkout pelo painel **Administração › Pagamentos**.
4. Para redirecionar após a compra, cadastre `xgoos.com.br` em **Asaas › Minha Conta › Informações**. Sem esse cadastro a API rejeita o callback; cobrança e webhook continuam funcionando.
5. Uma transação real só é considerada validada depois de um pagamento controlado, criação
   do recibo em `platform_checkout_access`, entrega observada no Resend e aceite do convite.
   Criar/consultar links não prova liquidação financeira.

## Isolamento entre produtos

Uma chave Asaas compartilhada envia ao mesmo conjunto de webhooks os pagamentos de todos os
produtos daquela conta. Não aponte o webhook desta instalação para uma conta que também
processa outro produto sem uma fronteira determinística anterior ao legado. Use uma conta ou
subconta exclusiva e configure nela os três links e o webhook do X-GO. Conta Asaas de pessoa
física não pode criar subconta via API; nesse caso, crie uma conta empresarial independente
ou regularize a conta principal antes de ativar a cobrança.

## Recuperação

Links são reutilizados por ID. Se a sincronização falhar, nenhum conteúdo novo da landing é publicado. Corrija a configuração e publique novamente; a operação converge sem criar links duplicados quando os IDs já estão registrados.

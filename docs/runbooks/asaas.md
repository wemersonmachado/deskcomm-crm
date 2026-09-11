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

Eventos aceitos são registrados em `platform_payment_events`. Pagamentos que ainda não tenham organização associada aparecem como pendentes de conciliação no painel da plataforma; o sistema não cria tenant nem amplia acesso apenas porque recebeu um webhook.

## Operação

1. Confirme que `https://xgoos.com.br/api/v1/webhooks/asaas` está publicado.
2. Cadastre o webhook no Asaas com o token da instalação.
3. Publique os preços na landing e abra cada checkout pelo painel **Administração › Pagamentos**.
4. Para redirecionar após a compra, cadastre `xgoos.com.br` em **Asaas › Minha Conta › Informações**. Sem esse cadastro a API rejeita o callback; cobrança e webhook continuam funcionando.
5. Uma transação real só é considerada validada depois de um pagamento controlado e conciliação do evento. Criar/consultar links não prova liquidação financeira.

## Recuperação

Links são reutilizados por ID. Se a sincronização falhar, nenhum conteúdo novo da landing é publicado. Corrija a configuração e publique novamente; a operação converge sem criar links duplicados quando os IDs já estão registrados.

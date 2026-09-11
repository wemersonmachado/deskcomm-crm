# Agente externo por MCP

## Endereço e autenticação

- Endpoint de produção: `https://xgoos.com.br/api/mcp`
- Transporte: MCP Streamable HTTP, via `POST` (o SDK também gerencia `GET`/`DELETE`)
- Header obrigatório: `Authorization: Bearer dsk_...`
- Não use `/app/connections`: é uma página humana protegida por cookie.
- Não use a URL do Supabase: banco e MCP são fronteiras diferentes.

O plaintext do token aparece uma única vez em **Configurações › API Tokens**. O banco guarda
somente SHA-256. Crie um token por processo externo, com validade e privilégio mínimo.

## Escopos

`mcp:read` permite inicializar e usar ferramentas de leitura, inclusive
`crm_get_agent_configuration`. `mcp:write` não substitui os escopos específicos: o agente
também precisa de `contacts:write`, `leads:write` ou `messages:write` conforme as ações que
realmente executará. `role:manager` só entra quando uma tool exigir papel de gerente.

## Sequência de prova

1. Configure endpoint e Bearer no SDK MCP do processo externo.
2. Inicialize a sessão e execute `tools/list`.
3. Chame `crm_get_agent_configuration` antes de atender.
4. Confirme que a resposta pertence à organização do token e não contém credenciais.
5. No modo externo, mantenha um laço próprio para descobrir novas conversas/eventos e chamar
   as tools. O endpoint não hospeda, acorda ou altera automaticamente o código da VPS.
6. Revogue o token e confirme que a chamada seguinte recebe `401`.

Configuração genérica:

```json
{
  "mcpServers": {
    "xgo": {
      "type": "http",
      "url": "https://xgoos.com.br/api/mcp",
      "headers": {
        "Authorization": "Bearer COLE_AQUI_O_TOKEN_DSK"
      }
    }
  }
}
```

Nunca registre o token em Git, query string, screenshot ou documento. Mantenha-o como secret
do processo externo e troque-o imediatamente se o plaintext tiver sido exposto.

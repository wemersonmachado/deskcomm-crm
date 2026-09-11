---
impacto: capacidade_nova
secao: corrigido
titulo: Perfil MCP externo já configurado aparece em Agentes
---

Integrações MCP externas que foram configuradas antes desta atualização passam a aparecer automaticamente em **Agentes** como perfil rascunho editável. O token segue guardado apenas como hash e não é copiado para o perfil. Os agentes externos também podem criar e atualizar contatos pelo mesmo contrato de CRM, quando o token tiver `mcp:write` e papel operacional.

---
impacto: nada_mudou
secao: corrigido
titulo: Negócio não pode mais apontar contato ou dono de outra organização
---

`contact_id` e `owner_user_id`, ao criar ou editar um negócio, nunca eram
conferidos contra a organização ativa — só `owner_agent_id` tinha essa checagem.
Um id vazado (ou uma planilha de importação com o campo errado) plantava um
negócio apontando para o contato ou o usuário de OUTRO tenant instalado na
mesma base. Achado pela auditoria de segurança de 2026-09-08; agora as duas
faltas recusam com 422 antes de gravar.

---
impacto: nada_mudou
secao: corrigido
titulo: Admin de plataforma "somente leitura" não consegue mais apagar organização
---

Auditoria de segurança achou que `platform_admins.scope = 'support_readonly'` — o
modo "só acompanhar, nunca mexer" — não era conferido em 6 das 8 rotas administrativas
que mutam dado: excluir organização, suspender, reativar e resolver incidente. Um
acesso provisionado como somente-leitura conseguia, mesmo assim, apagar uma organização
inteira e definitivamente (`DELETE /api/v1/admin/tenants/[id]`) — a mais grave, porque
não tem desfazer.

O teste que deveria pegar isso (`tests/unit/suporte-cobertura-de-efeitos.test.ts`)
passava verde sem examinar nenhum arquivo: construía os caminhos com o separador do
sistema operacional e filtrava por `/route.ts` — no Windows isso nunca casava, e a
varredura rodava sobre uma lista vazia. Corrigido junto, com uma sonda de controle
positivo para a lista de arquivos nunca mais ficar vazia sem ninguém notar.

Quem já é administrador de plataforma com escopo completo (`full`) não muda nada.

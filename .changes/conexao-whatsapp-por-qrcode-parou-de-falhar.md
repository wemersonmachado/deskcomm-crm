---
impacto: nada_mudou
secao: corrigido
titulo: Conectar WhatsApp por QR Code parou de falhar sempre
---

Medido em produção: `fn_reserve_channel_connection` gerava nomes de sessão com 69
caracteres (`org_<uuid sem hífen>_<uuid sem hífen>`), e o WAHA
(`devlikeapro/waha:latest-2026.7.2`, o default documentado) recusa qualquer nome
acima de 54 — `POST /api/sessions` sempre voltava 400. Nenhuma conexão por QR Code
chegava a existir de verdade no WAHA; a tela só mostrava "Não foi possível concluir
a conexão" e ficava presa nisso para sempre, em qualquer instalação usando a imagem
default.

O nome agora tem 41 caracteres. Canais que já existiam e nunca chegaram a conectar
(sem número capturado, fora de `WORKING`) são renomeados automaticamente — nenhum
canal com conexão real é tocado. Quem atualizar recebe o conserto sem editar nada.

Também parou de mostrar o id interno da sessão (`org_<hex>_<hex>`) como nome do
canal na tela — um canal recém-criado, sem apelido nem número ainda, chegava a
exibir esse id cru até no título do diálogo de exclusão.

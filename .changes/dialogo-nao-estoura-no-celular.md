---
impacto: nada_mudou
secao: corrigido
titulo: Diálogos não estouram mais a tela no celular
---

Achado em produção na tela de Conexões: o diálogo de excluir/reconectar canal
mostrava o id interno da sessão como título (`Excluir org_<hex>_<hex>?`) — uma
string sem espaço nenhum, que o navegador prefere deixar transbordar a
quebrar. No mobile, onde o diálogo já ocupa a largura inteira da tela, isso
empurrava a caixa pra fora da viewport.

O conserto é na base (`DialogTitle`, usado em todo diálogo do app): título
comprido sem onde quebrar agora quebra por dentro da palavra, em vez de
estourar a caixa. Título curto (a imensa maioria) não muda nada, em nenhum
tamanho de tela. A barra de botões "Atualizar saúde" / "Conectar novo
WhatsApp" também ganhou permissão pra empilhar em telas estreitas, em vez de
forçar rolagem horizontal na página inteira.

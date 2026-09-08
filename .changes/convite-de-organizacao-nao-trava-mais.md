---
impacto: nada_mudou
secao: corrigido
titulo: Aceitar convite de organização não trava mais em beco sem saída
---

Duas travas no link de convite (`/team/accept-invite/<token>`), a mais grave delas afetando
todo dono de organização nova criada pelo painel de plataforma:

1. **Convidado sem conta ainda clicava em "Fazer login" primeiro** — botão grande, no topo — e
   caía num formulário pedindo uma senha que nunca existiu: o cadastro é só por convite, e é a
   própria pessoa quem escolhe a senha na tela de "Ainda não tenho conta". Sem explicação nem
   volta, a pessoa ficava presa achando que devia ter recebido uma senha por e-mail.
2. **Logado com a conta errada, o botão "Sair" não fazia nada.** Ele postava para
   `/api/auth/signout`, uma rota que nunca existiu no projeto — só existe a Server Action
   `signOut()`, usada em todo o resto do produto. Clicar em Sair não desconectava ninguém.

Agora "Ainda não tenho conta" vem primeiro e em destaque, com uma linha explicando que não há
senha por e-mail. E "Sair" de fato desconecta e devolve a pessoa para `/login` já apontando de
volta para o próprio link do convite, em vez de perder o convite no meio do caminho.

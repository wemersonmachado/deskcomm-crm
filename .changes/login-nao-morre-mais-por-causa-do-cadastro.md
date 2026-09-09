---
impacto: nada_mudou
secao: corrigido
titulo: Duas chaves com o mesmo nome faziam login parar de funcionar
---

`[auth.email] enable_signup` e `[auth] enable_signup`, em `supabase/config.toml`,
têm o MESMO nome e fazem coisas opostas: a de cima liga/desliga o provedor de
e-mail inteiro (login incluído), a de baixo é o gate real de cadastro. O commit
de ontem que fechou o cadastro anônimo desligou as duas achando que ambas eram
o mesmo gate — e a de cima, desligada, derrubava o login por e-mail/senha de
qualquer usuário já existente.

Produção nunca foi afetada: o instalador self-host (`marca-emails.sh`) sempre
usou a chave certa. O efeito ficava só no ambiente local/CI — e ficou invisível
por um tempo porque uma sessão de QA anterior mediu o mesmo sintoma, tratou
como "config de ambiente de teste" e documentou o contorno errado. Login volta
a funcionar em qualquer ambiente; cadastro anônimo continua fechado (a chave
certa não mudou).

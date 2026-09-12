# Um checkout por projeto

## Regra

O checkout operacional do produto é exclusivamente a raiz `DeskComm`. Não crie
worktrees, clones, cópias com sufixo ou diretórios de isolamento sem autorização
explícita do proprietário. Código, migrations, `.env`, evidências e deploy devem
ter uma única fonte operacional.

## Por que esta trava existe

Uma worktree é um recurso legítimo do Git para trabalho paralelo, mas aqui ela
criou duas linhas de commits concorrentes. Isso torna ambíguo qual versão contém
o pagamento, o webhook, as migrations e os ajustes de agentes. A duplicação não
é backup e não é deploy: é risco de perda por divergência.

## Verificação obrigatória

Antes de editar, validar, commitar ou fazer deploy:

```bash
pnpm workspace:guard
git worktree list --porcelain
git status --short --branch
```

O primeiro comando falha se existir mais de um checkout registrado. Ele faz parte
de `pnpm gov:verify` para tornar a divergência visível antes de uma entrega.

## Recuperação excepcional

Se for indispensável analisar uma worktree já existente:

1. Não edite os dois checkouts em paralelo.
2. Liste commits exclusivos de cada lado:

   ```bash
   git log --oneline principal..worktree
   git log --oneline worktree..principal
   ```

3. Crie um checkpoint recuperável da branch principal e guarde arquivos não
   rastreados com `git stash push --include-untracked`.
4. Consolide por merge ou cherry-pick no checkout principal; resolva conflitos
   preservando o código mais recente e todos os migrations necessários.
5. Rode as verificações proporcionais à mudança.
6. Só então remova a worktree com `git worktree remove <caminho>`.
7. Restaure o stash e confirme que `.env` permaneceu somente no checkout
   principal. Nunca imprima ou copie segredos durante essa operação.

`ALLOW_MULTIPLE_WORKTREES=1 pnpm workspace:guard` só pode ser usado para a etapa
temporária de recuperação acima; não é permissão permanente para desenvolvimento
paralelo.

## Definição de concluído

- `git worktree list --porcelain` mostra uma única entrada.
- a branch principal contém todos os commits necessários;
- migrations, baseline e manifesto estão alinhados quando houver schema;
- `.env` e o cofre de credenciais permanecem no checkout principal;
- não existem cópias de projeto sob `.worktrees`.

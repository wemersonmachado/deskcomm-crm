#!/usr/bin/env node

/**
 * Impede que um segundo checkout Git passe despercebido.
 *
 * Este produto opera somente no checkout principal. Uma worktree paralela pode
 * acumular commits, migrations e .env diferentes e torna incerto qual código
 * chegou ao deploy. A única exceção é um operador definir conscientemente a
 * variável abaixo para uma recuperação pontual; ela deixa um aviso visível.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const worktrees = output
  .split(/\r?\n/)
  .filter((line) => line.startsWith("worktree "))
  .map((line) => resolve(line.slice("worktree ".length)));

if (worktrees.length <= 1) {
  console.log("[workspace:guard] OK — somente um checkout Git registrado.");
  process.exit(0);
}

const detail = worktrees.map((path) => `  - ${path}`).join("\n");
const message = [
  "[workspace:guard] BLOQUEADO — há mais de um checkout Git para este projeto:",
  detail,
  "Consolide commits e arquivos no checkout principal antes de continuar.",
  "Para uma recuperação excepcional e deliberada, use ALLOW_MULTIPLE_WORKTREES=1 uma única vez.",
].join("\n");

if (process.env.ALLOW_MULTIPLE_WORKTREES === "1") {
  console.warn(`${message}\n[workspace:guard] Exceção temporária aceita por variável explícita.`);
  process.exit(0);
}

console.error(message);
process.exit(1);

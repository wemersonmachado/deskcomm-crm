/**
 * Workers AI precisa de duas peças por organização: account id + API token.
 * Elas ficam juntas no mesmo cofre BYOK, no formato `account_id:token`, para
 * evitar coluna nova e, principalmente, impedir um account id global de vazar
 * de uma organização para outra.
 */
export function parseCloudflareAiCredential(value: string): {
  accountId: string;
  apiToken: string;
} | null {
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const accountId = value.slice(0, separator).trim();
  const apiToken = value.slice(separator + 1).trim();
  if (!/^[a-f0-9]{32}$/i.test(accountId)) return null;
  if (apiToken.length < 20 || apiToken.length > 1024 || /\s/.test(apiToken)) return null;
  return { accountId, apiToken };
}

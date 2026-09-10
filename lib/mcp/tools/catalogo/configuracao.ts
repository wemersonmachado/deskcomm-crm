import { declararTools } from "./tipos";
export const TOOLS_CONFIGURACAO = declararTools([{
  name: "crm_get_agent_configuration", category: "read", rotulo: "Consultar instruções publicadas",
  explicacao: "Consulta se o assistente deve manter suas instruções próprias ou usar as instruções publicadas da empresa, sem alterar dados.",
  oQueToca: "Configuração do assistente", risco: "seguro", pacotes: ["atender"],
}]);

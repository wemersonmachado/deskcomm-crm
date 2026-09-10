import { z } from "zod";

const text = z.string().trim().min(1).max(400);
const destination = z.string().trim().max(1000).refine((value) => {
  if (/[\u0000-\u0020\\]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Use um caminho interno ou endereço HTTPS.");
const card = z.object({ title: text, description: text }).strict();
export const landingSchema = z.object({
  theme: z.enum(["dark", "light"]),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  eyebrow: text,
  title: text,
  subtitle: text,
  cta_label: text,
  cta_url: destination,
  pain_title: text,
  pain_description: text,
  benefits_title: text,
  benefits: z.array(card).min(3).max(9),
  steps_title: text,
  steps: z.array(card).min(3).max(6),
  pricing_title: text,
  pricing_note: text,
  plans: z.array(z.object({ name: text, price: text, description: text, features: z.array(text).min(1).max(8) }).strict()).length(3),
  faq: z.array(z.object({ question: text, answer: text }).strict()).min(1).max(10),
  closing_title: text,
  closing_description: text,
}).strict();
export type LandingConfig = z.infer<typeof landingSchema>;
export const DEFAULT_LANDING: LandingConfig = {
  theme: "dark", accent: "#8674ff", eyebrow: "ATENDIMENTO + IA + CRM, NO MESMO LUGAR",
  title: "Cada conversa pode ser o começo de uma venda.",
  subtitle: "Dê à sua equipe agentes de IA que conhecem seu negócio. Organize o WhatsApp, acompanhe oportunidades e mantenha pessoas no controle do atendimento.",
  cta_label: "Conhecer os planos", cta_url: "/#planos",
  pain_title: "Seu atendimento cresceu. A organização precisa acompanhar.",
  pain_description: "Mensagens espalhadas, respostas repetidas e oportunidades sem próximo passo consomem o tempo da equipe. Reúna a conversa, o contexto e a ação em um único fluxo.",
  benefits_title: "Menos tarefas repetidas. Mais espaço para atender bem.",
  benefits: [
    { title: "Uma caixa de entrada para a equipe", description: "Distribua conversas, veja responsáveis e acompanhe o histórico sem perder o contexto do cliente." },
    { title: "Agentes com a voz do seu negócio", description: "Defina instruções, materiais e ferramentas. Teste o comportamento antes de liberar o atendimento." },
    { title: "Oportunidades com próximo passo", description: "Organize contatos, etapas do funil, tarefas e agendamentos junto da conversa." },
    { title: "Pessoas no controle", description: "Encaminhe situações para um atendente e acompanhe as ações da IA com histórico e permissões." },
    { title: "Liberdade para escolher sua IA", description: "Conecte provedores compatíveis ou integre seu agente externo pelas ferramentas do CRM." },
    { title: "Cada empresa no seu espaço", description: "Personalize a marca, a equipe e as áreas visíveis de cada organização, com acessos separados." },
  ],
  steps_title: "Do seu negócio ao primeiro atendimento.",
  steps: [
    { title: "Personalize seu espaço", description: "Receba o convite, entre na organização e configure nome, identidade visual e equipe." },
    { title: "Conecte o atendimento", description: "Vincule o WhatsApp e escolha o provedor de IA que fará parte da operação." },
    { title: "Prepare seu agente", description: "Defina a função, adicione conhecimento e selecione o que ele pode fazer. O rascunho guarda seu progresso." },
    { title: "Teste, publique e acompanhe", description: "Confira as respostas, libere o agente e acompanhe conversas, encaminhamentos e consumo." },
  ],
  pricing_title: "Encontre o formato da sua operação.",
  pricing_note: "Valores ilustrativos, sujeitos à definição comercial. Não há cobrança ou contratação automática. Custos de IA, WhatsApp e infraestrutura devem ser confirmados na proposta.",
  plans: [
    { name: "Standard", price: "R$ 197/mês", description: "Para organizar os primeiros atendimentos.", features: ["Caixa de entrada compartilhada", "Contatos e funil de vendas", "Configuração inicial de agente"] },
    { name: "Pro", price: "R$ 497/mês", description: "Para uma operação com mais fluxos e automação.", features: ["Recursos do Standard", "Agentes e base de conhecimento", "Fluxos e acompanhamento de consumo"] },
    { name: "Enterprise", price: "R$ 997/mês", description: "Para desenhar uma operação personalizada.", features: ["Recursos do Pro", "Integrações externas por MCP", "Escopo e implantação sob proposta"] },
  ],
  faq: [
    { question: "Preciso trocar a minha equipe por IA?", answer: "Não. Agentes e pessoas trabalham juntos. Você define a atuação da IA e quando encaminhar a conversa para um atendente." },
    { question: "Posso usar um agente que já tenho?", answer: "A plataforma expõe ferramentas via MCP para integrações externas. A conexão exige um cliente compatível e configuração das permissões da organização." },
    { question: "Como começo?", answer: "O acesso é liberado por convite do administrador. Entre em contato para definir o escopo e receber as orientações de implantação." },
  ],
  closing_title: "Seu próximo atendimento pode começar melhor.",
  closing_description: "Conheça a operação, escolha seu formato e prepare seu time para transformar conversas em próximos passos.",
};

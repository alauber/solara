// Papéis de agente do SPEC (nomes exatos). Nenhum é chamado nesta etapa.
export const PAPEIS_AGENTES = [
  "triador",
  "pesquisador",
  "redator",
  "revisor",
  "investigador",
  "consolidador",
] as const;
export type PapelAgente = (typeof PAPEIS_AGENTES)[number];

// Organograma por área (SPEC 3.3). O orquestrador é a raiz e não é um papel de agente.
export const ORGANOGRAMA: Record<string, readonly PapelAgente[]> = {
  vendas: ["triador", "pesquisador", "redator", "revisor"],
  financeiro: ["investigador", "consolidador", "revisor"],
};

// Quando o revisor reprova, a seta vermelha aponta para quem refaz o trabalho (SPEC 3.3).
export const ALVO_DEVOLUCAO: Record<string, PapelAgente> = {
  vendas: "redator",
  financeiro: "consolidador",
};

export type StatusExecucao = "rodando" | "ok" | "erro";

export type ExecucaoAgente = {
  id: string;
  area: string;
  item_tipo: string;
  item_id: string;
  agente: string;
  chamado_por: string | null;
  status: StatusExecucao;
  entrada: unknown;
  saida: unknown;
  erro: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  inicio: string;
  fim: string | null;
};

export type StatusAprovacao = "pendente" | "aprovada" | "editada" | "rejeitada";

export type Aprovacao = {
  id: string;
  area: string;
  item_tipo: string;
  item_id: string;
  titulo: string;
  proposta: unknown;
  status: StatusAprovacao;
  decidido_por: string | null;
  decidido_em: string | null;
  observacao: string | null;
};

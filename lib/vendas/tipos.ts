// Status do pedido de orçamento (SPEC 4.1), na ordem das colunas do kanban.
export const STATUS_PEDIDO = [
  "novo",
  "processando",
  "aguardando_aprovacao",
  "respondido",
  "rejeitado",
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  novo: "Novo",
  processando: "Processando",
  aguardando_aprovacao: "Aguardando aprovação",
  respondido: "Respondido",
  rejeitado: "Rejeitado",
};

export type Pedido = {
  cod_pedido: string;
  data: string;
  cod_cliente: string;
  canal: string;
  mensagem: string | null;
  status: StatusPedido;
};

export type ClienteResumo = {
  cod_cliente: string;
  nome: string;
};

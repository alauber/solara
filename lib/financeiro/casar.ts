import { normalizarTexto, type TituloAberto } from "@/lib/financeiro/limpar";

// Casamento de créditos com títulos a receber (SPEC 5.3). Código, sem modelo.

export type TipoInicial =
  | "valor_diferente_mesma_nf"
  | "sem_titulo_correspondente"
  | "possivel_soma"
  | "duplicado"
  | "vencido_sem_pagamento";

export type LancamentoCasavel = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
};

export type DivergenciaCalculada = {
  tipo_inicial: TipoInicial;
  lancamento_id: string | null;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
};

export type ResultadoCasamento = {
  casados: { lancamento_id: string; cod_titulo: string }[];
  ignorados: string[]; // ids dos débitos
  divergencias: DivergenciaCalculada[];
};

const TOLERANCIA = 0.005;
const DIAS_CASAMENTO_DATA = 5;

const iguais = (a: number, b: number) => Math.abs(a - b) < TOLERANCIA;

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

export function extrairNF(descricao: string): string | null {
  const m = /NF-\s?(\d+)/i.exec(descricao);
  return m ? `NF-${m[1]}` : null;
}

function normNF(nota: string | null): string | null {
  return nota ? nota.toUpperCase().replace(/\s/g, "") : null;
}

// Dois títulos do mesmo cliente cuja soma é o valor do crédito.
function acharPar(livres: TituloAberto[], valor: number): [TituloAberto, TituloAberto] | null {
  for (let i = 0; i < livres.length; i++) {
    for (let j = i + 1; j < livres.length; j++) {
      const a = livres[i];
      const b = livres[j];
      if (a.cod_cliente === b.cod_cliente && iguais(a.valor + b.valor, valor)) return [a, b];
    }
  }
  return null;
}

export function casar(
  lancamentos: LancamentoCasavel[],
  titulos: TituloAberto[],
  dataFim: string,
): ResultadoCasamento {
  const abertos = titulos.filter((t) => t.status === "aberto");
  const usados = new Set<string>(); // títulos já casados com um crédito
  const reservados = new Set<string>(); // títulos citados em uma divergência
  const livre = (t: TituloAberto) => !usados.has(t.cod_titulo) && !reservados.has(t.cod_titulo);

  const casados: ResultadoCasamento["casados"] = [];
  const ignorados: string[] = [];
  const divergencias: DivergenciaCalculada[] = [];

  const ordenados = [...lancamentos].sort((a, b) => a.data.localeCompare(b.data));

  for (const l of ordenados) {
    if (l.tipo === "debito") {
      ignorados.push(l.id);
      continue;
    }

    const nf = extrairNF(l.descricao);

    // Regra 1: NF na descrição e título com a mesma nota e o mesmo valor.
    const porNf = nf
      ? abertos.find((t) => livre(t) && normNF(t.nota_fiscal) === nf && iguais(t.valor, l.valor))
      : undefined;
    if (porNf) {
      usados.add(porNf.cod_titulo);
      casados.push({ lancamento_id: l.id, cod_titulo: porNf.cod_titulo });
      continue;
    }

    // Regra 2: exatamente um título em aberto com o mesmo valor e vencimento a até 5 dias.
    const porValor = abertos.filter(
      (t) => livre(t) && iguais(t.valor, l.valor) && diasEntre(t.vencimento, l.data) <= DIAS_CASAMENTO_DATA,
    );
    if (porValor.length === 1) {
      usados.add(porValor[0].cod_titulo);
      casados.push({ lancamento_id: l.id, cod_titulo: porValor[0].cod_titulo });
      continue;
    }

    // Divergências, nesta ordem.
    if (nf) {
      // duplicado: o título da NF com esse valor já foi casado por outro crédito.
      const dup = abertos.find(
        (t) => usados.has(t.cod_titulo) && normNF(t.nota_fiscal) === nf && iguais(t.valor, l.valor),
      );
      if (dup) {
        divergencias.push({
          tipo_inicial: "duplicado",
          lancamento_id: l.id,
          cod_titulo: dup.cod_titulo,
          valor_lancamento: l.valor,
          valor_titulo: dup.valor,
        });
        continue;
      }

      // valor_diferente_mesma_nf: a NF existe, mas o valor não bate.
      const mesmaNf = abertos.find((t) => livre(t) && normNF(t.nota_fiscal) === nf);
      if (mesmaNf) {
        reservados.add(mesmaNf.cod_titulo);
        divergencias.push({
          tipo_inicial: "valor_diferente_mesma_nf",
          lancamento_id: l.id,
          cod_titulo: mesmaNf.cod_titulo,
          valor_lancamento: l.valor,
          valor_titulo: mesmaNf.valor,
        });
        continue;
      }
    }

    // possivel_soma: o crédito é a soma de dois títulos do mesmo cliente.
    const par = acharPar(abertos.filter(livre), l.valor);
    if (par) {
      par.forEach((t) => reservados.add(t.cod_titulo));
      divergencias.push({
        tipo_inicial: "possivel_soma",
        lancamento_id: l.id,
        cod_titulo: null,
        valor_lancamento: l.valor,
        valor_titulo: par[0].valor + par[1].valor,
      });
      continue;
    }

    divergencias.push({
      tipo_inicial: "sem_titulo_correspondente",
      lancamento_id: l.id,
      cod_titulo: null,
      valor_lancamento: l.valor,
      valor_titulo: null,
    });
  }

  // vencido_sem_pagamento: título em aberto, vencido até o fim do extrato, sem crédito que o cubra.
  for (const t of abertos) {
    if (!livre(t) || t.vencimento >= dataFim) continue;
    divergencias.push({
      tipo_inicial: "vencido_sem_pagamento",
      lancamento_id: null,
      cod_titulo: t.cod_titulo,
      valor_lancamento: null,
      valor_titulo: t.valor,
    });
  }

  return { casados, ignorados, divergencias };
}

// Para o Investigador: títulos que podem ter relação com um lançamento (SPEC 5.4, passo 2).
export function titulosCandidatos(
  lancamento: { data: string; descricao: string; valor: number } | null,
  titulosAbertos: TituloAberto[],
  clientes: { cod_cliente: string; nome: string }[],
  codTituloVencido: string | null,
): TituloAberto[] {
  if (!lancamento) {
    return titulosAbertos.filter((t) => t.cod_titulo === codTituloVencido);
  }

  const descricao = normalizarTexto(lancamento.descricao);
  const cliente = clientes.find((c) => c.nome && descricao.includes(normalizarTexto(c.nome)));

  const base = cliente
    ? titulosAbertos.filter((t) => t.cod_cliente === cliente.cod_cliente)
    : titulosAbertos.filter((t) => Math.abs(t.valor - lancamento.valor) <= lancamento.valor * 0.1);

  return base.filter((t) => diasEntre(t.vencimento, lancamento.data) <= 30).slice(0, 10);
}

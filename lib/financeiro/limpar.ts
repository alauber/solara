// Limpeza do extrato e dos títulos (SPEC 5.3). É código determinístico, sem modelo.
// Não usa APIs de Node: roda no navegador (prévia) e no servidor (gravação).

export type LancamentoLimpo = {
  cod: string;
  data: string; // ISO yyyy-mm-dd
  descricao: string;
  valor: number; // sempre positivo; o sinal vira o tipo
  tipo: "credito" | "debito";
};

export type ResultadoLimpeza = {
  formato: "limpo" | "bruto";
  periodo: { inicio: string; fim: string } | null;
  lancamentos: LancamentoLimpo[];
  ignoradas: number;
  previaBruta: string[]; // primeiras 6 linhas como vieram
  previaLimpa: LancamentoLimpo[]; // primeiras 6 linhas normalizadas
};

export type TituloAberto = {
  cod_titulo: string;
  cod_cliente: string;
  nota_fiscal: string | null;
  valor: number;
  emissao: string | null;
  vencimento: string;
  status: string;
};

const CABECALHO_LIMPO = "cod_lancamento";

// Arquivo recebido como bytes: UTF-8 se for válido, senão latin-1 (SPEC 5.3).
export function decodificarArquivo(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}

export function linhasDoTexto(texto: string): string[] {
  return texto
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((linha) => linha.trim() !== "");
}

// CSV com aspas. Campos já sem espaços nas bordas.
export function parseCsvLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === separador) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((campo) => campo.trim());
}

// "1.250,00" -> 1250; "540.00" -> 540; "-42.300,00" -> -42300.
export function valorBr(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const numero = Number(normal);
  return Number.isFinite(numero) ? numero : null;
}

// "25/07/2026" -> "2026-07-25".
export function dataBrParaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// 1250 -> "1.250,00"
export function formatarValor(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extrairPeriodo(texto: string): { inicio: string; fim: string } | null {
  const m = /Periodo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i.exec(texto);
  if (!m) return null;
  const inicio = dataBrParaIso(m[1]);
  const fim = dataBrParaIso(m[2]);
  return inicio && fim ? { inicio, fim } : null;
}

export function limparExtrato(texto: string): ResultadoLimpeza {
  const linhas = linhasDoTexto(texto);
  const previaBruta = linhas.slice(0, 6);
  const periodo = extrairPeriodo(texto);

  const lancamentos: LancamentoLimpo[] = [];
  let ignoradas = 0;
  let formato: "limpo" | "bruto";

  if ((linhas[0] ?? "").toLowerCase().startsWith(CABECALHO_LIMPO)) {
    formato = "limpo";
    const cabecalho = linhas[0];
    const separador = cabecalho.includes(";") && !cabecalho.includes(",") ? ";" : ",";
    const colunas = parseCsvLinha(cabecalho, separador).map((c) => c.toLowerCase());
    const pos = (nome: string) => colunas.indexOf(nome);

    linhas.slice(1).forEach((linha, i) => {
      const campos = parseCsvLinha(linha, separador);
      const data = campos[pos("data")] ?? "";
      const valor = valorBr(campos[pos("valor")] ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || valor === null) {
        ignoradas++;
        return;
      }
      lancamentos.push({
        cod: campos[pos("cod_lancamento")] || `L${String(i + 1).padStart(3, "0")}`,
        data,
        descricao: campos[pos("descricao")] ?? "",
        valor: Math.abs(valor),
        tipo: (campos[pos("tipo")] ?? "").toLowerCase() === "debito" ? "debito" : "credito",
      });
    });
  } else {
    formato = "bruto";
    const indiceCabecalho = linhas.findIndex((linha) => /^data\b/i.test(linha.trim()));
    if (indiceCabecalho < 0) {
      throw new Error('cabeçalho "Data" não encontrado: o arquivo não parece um extrato do banco');
    }
    const separador = linhas[indiceCabecalho].includes(";") ? ";" : ",";

    linhas.slice(indiceCabecalho + 1).forEach((linha) => {
      // Colunas do banco: Data; Historico; Valor (R$); Saldo (R$). O saldo é descartado.
      const [dataTxt = "", historico = "", valorTxt = ""] = parseCsvLinha(linha, separador);
      if (/SALDO/i.test(historico)) return; // SALDO ANTERIOR e similares não são lançamentos
      const data = dataBrParaIso(dataTxt);
      const valor = valorBr(valorTxt);
      if (!data || valor === null) {
        ignoradas++;
        return;
      }
      lancamentos.push({
        cod: `L${String(lancamentos.length + 1).padStart(3, "0")}`,
        data,
        descricao: historico,
        valor: Math.abs(valor),
        tipo: valor < 0 ? "debito" : "credito",
      });
    });
  }

  return {
    formato,
    periodo,
    lancamentos,
    ignoradas,
    previaBruta,
    previaLimpa: lancamentos.slice(0, 6),
  };
}

// Títulos enviados em planilha: formato limpo, com cabeçalho cod_titulo,...
export function limparTitulos(texto: string): TituloAberto[] {
  const linhas = linhasDoTexto(texto);
  const cabecalho = linhas[0] ?? "";
  if (!cabecalho.toLowerCase().includes("cod_titulo")) {
    throw new Error("planilha de títulos sem cabeçalho cod_titulo (use o formato do ERP)");
  }
  const separador = cabecalho.includes(";") && !cabecalho.includes(",") ? ";" : ",";
  const colunas = parseCsvLinha(cabecalho, separador).map((c) => c.toLowerCase());
  const pos = (nome: string) => colunas.indexOf(nome);

  const titulos: TituloAberto[] = [];
  for (const linha of linhas.slice(1)) {
    const campos = parseCsvLinha(linha, separador);
    const valor = valorBr(campos[pos("valor")] ?? "");
    const vencimento = campos[pos("vencimento")] ?? "";
    if (!campos[pos("cod_titulo")] || valor === null || !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) continue;
    titulos.push({
      cod_titulo: campos[pos("cod_titulo")],
      cod_cliente: campos[pos("cod_cliente")] ?? "",
      nota_fiscal: campos[pos("nota_fiscal")] || null,
      valor,
      emissao: campos[pos("emissao")] || null,
      vencimento,
      status: campos[pos("status")] || "aberto",
    });
  }
  return titulos;
}

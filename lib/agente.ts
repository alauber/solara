import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PAPEIS_AGENTES, type PapelAgente } from "@/lib/motor/tipos";

// Única função que chama a API da Anthropic (CLAUDE.md). Todo agente passa por aqui.

const MODELO = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;
const LIMITE_ERRO = 2000;

export type ContextoAgente = {
  area: string;
  item_tipo: string;
  item_id: string;
  chamado_por?: string | null;
};

export type ResultadoAgente<S = unknown> = {
  saida: S;
  execucao_id: string;
};

// Cliente criado na primeira chamada: a chave ANTHROPIC_API_KEY só é exigida quando um agente roda.
let cliente: Anthropic | null = null;
function clienteAnthropic(): Anthropic {
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

async function lerPrompt(area: string, papel: PapelAgente): Promise<string> {
  const arquivo = path.join(process.cwd(), "prompts", area, `${papel}.md`);
  return readFile(arquivo, "utf-8");
}

export async function agente<S = unknown>(
  papel: PapelAgente,
  entrada: unknown,
  contexto: ContextoAgente,
): Promise<ResultadoAgente<S>> {
  if (!(PAPEIS_AGENTES as readonly string[]).includes(papel)) {
    throw new Error(`papel de agente desconhecido: ${papel}`);
  }
  if (!/^[a-z]+$/.test(contexto.area)) {
    throw new Error(`área inválida: ${contexto.area}`);
  }

  const supabase = criarClienteAdmin();

  // 1. Registra a execução como "rodando" antes de chamar o modelo.
  const { data: linha, error: erroInsert } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: contexto.area,
      item_tipo: contexto.item_tipo,
      item_id: contexto.item_id,
      agente: papel,
      chamado_por: contexto.chamado_por ?? null,
      status: "rodando",
      entrada,
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroInsert || !linha) {
    throw new Error(`não foi possível registrar a execução: ${erroInsert?.message ?? "sem linha"}`);
  }
  const execucaoId: string = linha.id;

  let tokensEntrada: number | null = null;
  let tokensSaida: number | null = null;

  try {
    // 2. System prompt vem do arquivo do papel, nunca do código.
    const systemPrompt = await lerPrompt(contexto.area, papel);

    // 3. Chamada ao modelo.
    const resposta = await clienteAnthropic().messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(entrada) }],
    });
    tokensEntrada = resposta.usage.input_tokens;
    tokensSaida = resposta.usage.output_tokens;

    const texto = resposta.content
      .filter((bloco) => bloco.type === "text")
      .map((bloco) => bloco.text)
      .join("");

    // 4. Saída tem que ser JSON estrito. Falha de parse é falha do agente.
    let saida: S;
    try {
      saida = JSON.parse(texto) as S;
    } catch {
      throw new ErroSaidaInvalida(texto);
    }

    // 5. Registra sucesso.
    await supabase
      .from("execucoes_agentes")
      .update({
        status: "ok",
        saida,
        tokens_entrada: tokensEntrada,
        tokens_saida: tokensSaida,
        fim: new Date().toISOString(),
      })
      .eq("id", execucaoId);

    return { saida, execucao_id: execucaoId };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const textoErro = erro instanceof ErroSaidaInvalida
      ? `saída não é JSON válido: ${erro.bruto}`.slice(0, LIMITE_ERRO)
      : mensagem.slice(0, LIMITE_ERRO);

    await supabase
      .from("execucoes_agentes")
      .update({
        status: "erro",
        erro: textoErro,
        tokens_entrada: tokensEntrada,
        tokens_saida: tokensSaida,
        fim: new Date().toISOString(),
      })
      .eq("id", execucaoId);

    throw erro;
  }
}

class ErroSaidaInvalida extends Error {
  constructor(public readonly bruto: string) {
    super("saída não é JSON válido");
  }
}

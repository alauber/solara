"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ExecucaoAgente } from "@/lib/motor/tipos";

// Carrega as execuções de um item e mantém a lista atualizada por Realtime (SPEC 3.3).
export function useExecucoes(area: string, itemId: string): ExecucaoAgente[] {
  const [execucoes, setExecucoes] = useState<ExecucaoAgente[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let ativo = true;

    supabase
      .from("execucoes_agentes")
      .select("*")
      .eq("area", area)
      .eq("item_id", itemId)
      .order("inicio", { ascending: true })
      .then(({ data }) => {
        if (ativo && data) setExecucoes(data as ExecucaoAgente[]);
      });

    const canal = supabase
      .channel(`execucoes-${area}-${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "execucoes_agentes",
          filter: `item_id=eq.${itemId}`,
        },
        (evento) => {
          if (!ativo) return;
          if (evento.eventType === "DELETE") {
            const removido = evento.old as { id?: string };
            setExecucoes((atual) => atual.filter((e) => e.id !== removido.id));
            return;
          }
          const nova = evento.new as ExecucaoAgente;
          if (nova.area !== area) return;
          setExecucoes((atual) => {
            const semEla = atual.filter((e) => e.id !== nova.id);
            return [...semEla, nova].sort((a, b) => a.inicio.localeCompare(b.inicio));
          });
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [area, itemId]);

  return execucoes;
}

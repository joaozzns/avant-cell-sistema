/**
 * Consulta de IMEI em base de bloqueio (roubo, furto, perda).
 *
 * No Brasil a consulta oficial é pública, mas por página web (Anatel/ABR
 * Telecom), sem API gratuita. Então aqui existem dois caminhos:
 *
 *   1. Com serviço contratado: a loja cadastra a integração em Administração
 *      (kind 'imei_check', config { url, token }), e o sistema consulta
 *      sozinho ao digitar o IMEI.
 *   2. Sem serviço: o sistema abre a consulta oficial numa nova aba e o
 *      atendente registra o que viu. Fica gravado quem conferiu e quando —
 *      que é o que protege a loja depois.
 *
 * Em qualquer um dos casos, IMEI marcado como bloqueado impede a compra.
 */

export type ResultadoImei = {
  situacao: "livre" | "bloqueado" | "nao_encontrado";
  fonte: "consulta_automatica" | "conferencia_manual";
  detalhe?: string;
  consultado_em: string;
  consultado_por?: string;
};

export const URL_CONSULTA_OFICIAL = "https://consultaimei.anatel.gov.br";

export const SITUACOES: { valor: ResultadoImei["situacao"]; rotulo: string; ajuda: string }[] = [
  { valor: "livre", rotulo: "Livre", ajuda: "Sem registro de roubo, furto ou perda." },
  { valor: "bloqueado", rotulo: "Bloqueado", ajuda: "Aparelho com restrição: a compra não pode ser registrada." },
  { valor: "nao_encontrado", rotulo: "Não encontrado", ajuda: "A base não retornou nada para este IMEI." },
];

type Gateway = { url?: string; token?: string; provider?: string } | null;

/** Consulta pelo serviço contratado. Sem gateway, devolve null e a loja
 *  registra a conferência manual. */
export async function consultarImei(imei: string, gateway: Gateway): Promise<ResultadoImei | null> {
  if (!gateway?.url || !gateway.token) return null;

  try {
    const res = await fetch(`${gateway.url.replace(/\/$/, "")}/${encodeURIComponent(imei)}`, {
      headers: { Authorization: `Bearer ${gateway.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        situacao: "nao_encontrado",
        fonte: "consulta_automatica",
        detalhe: `Serviço respondeu ${res.status}`,
        consultado_em: new Date().toISOString(),
      };
    }
    const corpo = (await res.json()) as Record<string, unknown>;
    const bruto = JSON.stringify(corpo).toLowerCase();
    const bloqueado =
      corpo.blocked === true ||
      /"(status|situacao|situation)"\s*:\s*"(bloqueado|blocked|roubo|furto|stolen)"/.test(bruto);

    return {
      situacao: bloqueado ? "bloqueado" : "livre",
      fonte: "consulta_automatica",
      detalhe: typeof corpo.message === "string" ? corpo.message : undefined,
      consultado_em: new Date().toISOString(),
    };
  } catch (e) {
    return {
      situacao: "nao_encontrado",
      fonte: "consulta_automatica",
      detalhe: "Falha ao consultar: " + (e as Error).message,
      consultado_em: new Date().toISOString(),
    };
  }
}

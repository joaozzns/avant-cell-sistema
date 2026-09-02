/**
 * Adapter de emissão fiscal.
 *
 * Com um gateway configurado em Integrações (kind: 'fiscal_gateway',
 * config: { provider: 'focusnfe', token, environment }), a emissão é
 * enviada à API do provedor. Sem gateway, opera em MODO SIMULADO:
 * gera chave/protocolo fictícios e marca como autorizada — útil para
 * homologar o fluxo inteiro antes de contratar o emissor.
 */

export type EmissionResult = {
  status: "authorized" | "rejected" | "pending";
  accessKey?: string;
  protocol?: string;
  rejectionReason?: string;
  simulated: boolean;
};

type GatewayConfig = {
  provider?: string;
  token?: string;
  environment?: string;
} | null;

export async function emitDocument(input: {
  gateway: GatewayConfig;
  kind: "nfce" | "nfe" | "nfse";
  payload: Record<string, unknown>;
}): Promise<EmissionResult> {
  const { gateway } = input;

  if (gateway?.provider === "focusnfe" && gateway.token) {
    try {
      const base = gateway.environment === "production"
        ? "https://api.focusnfe.com.br"
        : "https://homologacao.focusnfe.com.br";
      const path = input.kind === "nfse" ? "/v2/nfse" : input.kind === "nfe" ? "/v2/nfe" : "/v2/nfce";
      const ref = `ref-${Date.now()}`;
      const res = await fetch(`${base}${path}?ref=${ref}`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(gateway.token + ":").toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.payload),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 422 || res.status === 400) {
        return {
          status: "rejected",
          rejectionReason: String(body.mensagem ?? body.erros ?? "Rejeitada pelo gateway"),
          simulated: false,
        };
      }
      // Focus processa async; aqui tratamos como pendente de consulta
      return {
        status: "pending",
        protocol: ref,
        simulated: false,
      };
    } catch (e) {
      return {
        status: "rejected",
        rejectionReason: "Falha de comunicação com o gateway: " + (e as Error).message,
        simulated: false,
      };
    }
  }

  // MODO SIMULADO (sem gateway contratado)
  const uf = "23"; // CE
  const random = () => Math.floor(Math.random() * 10);
  let key = uf
    + new Date().toISOString().slice(2, 7).replace("-", "")   // AAMM
    + "99999999999999"                                        // CNPJ (simulado)
    + (input.kind === "nfe" ? "55" : "65");                   // modelo
  while (key.length < 44) key += random();
  return {
    status: "authorized",
    accessKey: key,
    protocol: "SIM" + Date.now(),
    simulated: true,
  };
}

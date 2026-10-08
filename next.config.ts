import type { NextConfig } from "next";

/* Cabeçalhos de segurança.
 *
 * A varredura de 07/10/2026 mostrou que o sistema respondia só com HSTS (esse
 * a Vercel já põe). Faltavam os quatro baratos, que não dependem de ajustar
 * nada no código:
 *
 *  - X-Frame-Options: sem ele, qualquer site podia carregar o sistema dentro
 *    de um iframe invisível e colher cliques de quem está logado. O sistema
 *    não se abre em iframe em lugar nenhum, então SAMEORIGIN não tira nada.
 *  - nosniff: impede o navegador de adivinhar o tipo de um arquivo e executar
 *    como script algo que o servidor mandou como texto.
 *  - Referrer-Policy: sem ele, ao clicar num link para fora o endereço
 *    completo da página ia junto — e as páginas daqui levam id de OS, de
 *    venda e token de link público no caminho.
 *  - Permissions-Policy: o sistema não usa câmera, microfone nem localização;
 *    deixar explícito é de graça.
 *
 * Não há CSP ainda: o Next injeta script embutido na hidratação, e uma
 * política sem nonce quebraria a aplicação inteira. Fica anotado.
 */
const cabecalhos = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  /* a versão do framework não precisa ir em toda resposta */
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:caminho*", headers: cabecalhos }];
  },
};

export default nextConfig;

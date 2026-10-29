"use client";

import Script from "next/script";
import { useEffect } from "react";

/* Google Tag Manager, o mesmo contêiner do site (avantcell.com.br), para o
 * GA4 e as campanhas enxergarem o caminho inteiro: clicou em assinar no
 * site → criou a conta aqui.
 *
 * Só entra nas telas públicas (entrar, criar conta, recuperar senha) e na
 * de configurar a empresa. Nunca dentro do sistema: lá as telas mostram
 * clientes, valores e IMEIs, e o GTM pode carregar qualquer script que
 * alguém configurar no painel — não é lugar para isso.
 *
 * `evento` manda um aviso ao dataLayer uma única vez por sessão do
 * navegador, para recarregar a página não contar duas conversões. */
const GTM_ID = "GTM-543H5GN9";

export function Gtm({ evento, dados }: { evento?: string; dados?: Record<string, string> }) {
  useEffect(() => {
    if (!evento) return;
    const chave = `gtm:${evento}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, "1");
    } catch {
      /* sem sessionStorage (janela anônima restrita): manda assim mesmo */
    }
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: evento, ...dados });
  }, [evento, dados]);

  return (
    <Script id="gtm" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
    </Script>
  );
}

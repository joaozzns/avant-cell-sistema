"use client";

import Script from "next/script";
import { useEffect } from "react";

/* Google Tag Manager, o mesmo contêiner do site (avantcell.com.br), para o
 * GA4 e as campanhas enxergarem o caminho inteiro: clicou em assinar no
 * site → criou a conta aqui.
 *
 * Só é carregado pelas telas públicas (entrar, criar conta, recuperar
 * senha) e pela de configurar a empresa; o sistema em si não o inclui,
 * porque lá as telas mostram clientes, valores e IMEIs e o GTM roda o que
 * for configurado no painel. Atenção: depois de entrar, a navegação é sem
 * recarregar a página, então o GTM já carregado segue ativo naquela aba
 * até um recarregamento. Não configure no painel nada que leia o conteúdo
 * da página.
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

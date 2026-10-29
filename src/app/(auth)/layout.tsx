import Image from "next/image";
import { Gtm } from "@/components/gtm";

/* As telas de entrar, criar conta e recuperar senha usam o mesmo visual da
 * página /entrar do site: fundo azul-marinho, as ondas azuis ao fundo e um
 * cartão de vidro no meio. Antes era um cartão branco num fundo cinza — quem
 * vinha do site sentia que tinha trocado de produto no meio do caminho.
 *
 * As ondas são o mesmo desenho do site, guardado como arquivo em vez de
 * embutido: são 100 KB de SVG (26 KB comprimido) que o navegador baixa uma
 * vez e reaproveita nas três telas. Embutir custaria isso em cada página.
 * Entram por background-image, e não por <Image>: o otimizador do Next
 * recusa SVG e devolvia 400, deixando o fundo sem as ondas.
 *
 * O cartão é arredondado, não um círculo perfeito como no site. O círculo
 * funciona lá porque o formulário tem dois campos; o de criar conta tem
 * cinco e vazaria para fora da curva. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="area-entrada">
      <Gtm />
      <a href="https://avantcell.com.br" className="voltar-ao-site">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Voltar ao site
      </a>

      <div className="cartao-entrada">
        <h1 className="sr-only">Avant Cell</h1>
        <Image
          src="/logo-branca.svg"
          alt="Avant Cell"
          width={199}
          height={48}
          priority
          className="marca-entrada"
        />
        {children}
      </div>
    </div>
  );
}

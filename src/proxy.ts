import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /* `api/` fica de fora: webhook chega sem sessao nenhuma, por definicao.
       Quem avisa que uma loja pagou e o servidor do Mercado Pago, nao um
       navegador com cookie — passar pelo guarda de sessao redirecionava o
       aviso para a tela de login, e a cobranca nunca chegava. */
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

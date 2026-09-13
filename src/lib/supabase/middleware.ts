import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/* "/auth/sessao" recebe a sessao vinda da landing e precisa rodar sem sessao
   ainda — e justamente a pagina que vai cria-la. */
const PUBLIC_ROUTES = [
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/acompanhar",
  "/auth/sessao",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /* Não remover: renova a sessão e regrava os cookies quando o token expira.
     getClaims() confere a assinatura localmente (ES256 + JWKS em cache) em vez
     de ir ao Supabase Auth a cada requisição, como getUser() fazia. */
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) || pathname === "/";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

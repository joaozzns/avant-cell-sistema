import { SignupForm } from "./cadastro-form";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string; v?: string }>;
}) {
  const { convite, v } = await searchParams;
  const valido = convite && /^[0-9a-f-]{36}$/i.test(convite) ? convite : undefined;
  /* ?v= é o link do representante Avant Cell: a loja que chega por ele entra
     como venda dele, sem ninguém digitar nada depois */
  const indicacao = v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined;
  return <SignupForm convite={valido} indicacao={indicacao} />;
}

import { LoginForm } from "./login-form";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string; aviso?: string }>;
}) {
  const { convite, aviso } = await searchParams;
  const valido = convite && /^[0-9a-f-]{36}$/i.test(convite) ? convite : undefined;
  return <LoginForm convite={valido} semLoja={aviso === "sem-loja"} />;
}

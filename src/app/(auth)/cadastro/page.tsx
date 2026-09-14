import { SignupForm } from "./cadastro-form";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string }>;
}) {
  const { convite } = await searchParams;
  const valido = convite && /^[0-9a-f-]{36}$/i.test(convite) ? convite : undefined;
  return <SignupForm convite={valido} />;
}

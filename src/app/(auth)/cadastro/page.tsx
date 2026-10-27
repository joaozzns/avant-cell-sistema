import { SignupForm } from "./cadastro-form";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string; v?: string; plano?: string }>;
}) {
  const { convite, v, plano } = await searchParams;
  const valido = convite && /^[0-9a-f-]{36}$/i.test(convite) ? convite : undefined;
  /* ?v= é o link do representante Avant Cell: a loja que chega por ele entra
     como venda dele, sem ninguém digitar nada depois */
  const indicacao = v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined;
  /* ?plano= vem dos botões da página de planos do site. Sem isso a pessoa
     escolhia o plano lá, cadastrava, e tinha de escolher de novo aqui dentro
     — e toda escolha repetida é uma chance de desistir. */
  const escolhido = plano && /^[a-z]{3,20}$/.test(plano) ? plano : undefined;
  return <SignupForm convite={valido} indicacao={indicacao} plano={escolhido} />;
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { abrirPedido, anonimizar, exportarDados } from "../lgpd/actions";

/** O que a loja faz quando o cliente exerce os direitos da LGPD: entregar uma
 *  cópia dos dados ou sair da base. Fica no cadastro porque é ali que o
 *  atendente está quando o cliente liga pedindo. */
export function PrivacidadeCliente({
  clienteId, nome, anonimizado,
}: {
  clienteId: string; nome: string; anonimizado: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  function baixar() {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await exportarDados(clienteId);
      if (r.error || !r.arquivo) { setErro(r.error ?? "Falha ao gerar o arquivo."); return; }
      const url = URL.createObjectURL(new Blob([r.arquivo], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.nome ?? "dados.json"; a.click();
      URL.revokeObjectURL(url);
      setAviso("Arquivo gerado com tudo que a loja guarda sobre o cliente.");
    });
  }

  function registrar(tipo: "export" | "anonymization") {
    setErro(""); setAviso("");
    iniciar(async () => {
      const r = await abrirPedido(clienteId, tipo);
      if (r.error) { setErro(r.error); return; }
      setAviso("Pedido registrado com prazo de 15 dias. Acompanhe em Clientes → Pedidos LGPD.");
      router.refresh();
    });
  }

  function anonimizarAgora() {
    setErro(""); setAviso("");
    if (!confirm(
      `Anonimizar ${nome}?\n\nNome, CPF, contato e endereço são apagados e não voltam. ` +
      `Vendas, notas fiscais e OS continuam guardadas, ligadas a um cliente sem nome.`)) return;
    iniciar(async () => {
      const r = await anonimizar(clienteId);
      if (r.error) { setErro(r.error); return; }
      router.refresh();
    });
  }

  if (anonimizado) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Privacidade</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Cliente anonimizado a pedido do titular. O histórico de compras, notas e OS continua
          guardado pelo prazo legal, sem identificar a pessoa.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Privacidade (LGPD)</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="text-muted-foreground">
          O cliente pode pedir uma cópia dos dados que a loja guarda, ou pedir para sair da base.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pendente} onClick={baixar}>
            <Download className="h-4 w-4" /> Baixar dados
          </Button>
          <Button size="sm" variant="ghost" disabled={pendente} onClick={() => registrar("export")}>
            Registrar pedido de cópia
          </Button>
          <Button size="sm" variant="ghost" disabled={pendente} onClick={() => registrar("anonymization")}>
            Registrar pedido de exclusão
          </Button>
          <Button size="sm" variant="destructive" disabled={pendente} onClick={anonimizarAgora}>
            <ShieldOff className="h-4 w-4" /> Anonimizar agora
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Anonimizar não apaga vendas nem notas fiscais: a loja é obrigada a guardá-las. O que sai é
          o que identifica a pessoa.
        </p>
        {aviso && <p className="text-green-700 dark:text-green-400">{aviso}</p>}
        {erro && <p className="text-destructive">{erro}</p>}
      </CardContent>
    </Card>
  );
}

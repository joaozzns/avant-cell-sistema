import { getSessionContext } from "@/lib/context";
import { Importador } from "./importador";

export default async function ImportarPage() {
  const { storeName } = await getSessionContext();

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar dados</h1>
        <p className="text-sm text-muted-foreground">
          Traga produtos, clientes, fornecedores e aparelhos de outro sistema a partir de
          uma planilha. Saldos de estoque e aparelhos entram na loja{" "}
          <span className="font-medium text-foreground">{storeName}</span>.
        </p>
      </div>
      <Importador />
    </div>
  );
}

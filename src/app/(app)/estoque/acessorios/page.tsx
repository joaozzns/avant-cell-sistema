import { ProdutosPorTipo } from "../por-tipo";

export default async function AcessoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { categoria } = await searchParams;
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Acessórios</h1>
        <p className="text-sm text-muted-foreground">
          Capinhas, películas, carregadores e tudo que se vende por quantidade.
        </p>
      </div>
      <ProdutosPorTipo tipo="accessory" categoria={categoria} />
    </div>
  );
}

import { ListaDeArtigos } from "./lista";

export const metadata = { title: "Ajuda" };

export default function AjudaPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Como usar o Avant Cell</h1>
        <p className="mt-1 text-muted-foreground">
          Procure pelo que você está tentando fazer. Em qualquer tela do sistema,
          o botão <strong>?</strong> no topo abre direto o artigo daquela tela.
        </p>
      </div>
      <ListaDeArtigos />
    </div>
  );
}

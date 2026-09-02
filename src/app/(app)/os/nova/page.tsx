import { OsForm } from "./os-form";

export default function NewOsPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Abrir OS — check-in</h1>
        <p className="text-sm text-muted-foreground">
          Nada entra na bancada sem registro. O número da OS e o link público
          são gerados na abertura.
        </p>
      </div>
      <OsForm />
    </div>
  );
}

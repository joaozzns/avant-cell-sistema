import { getSessionContext } from "@/lib/context";
import { saveCategory, saveBrand } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CategoriesPage() {
  const { supabase } = await getSessionContext();
  const [{ data: categories }, { data: brands }] = await Promise.all([
    supabase.from("categories").select("id, name, active").order("name"),
    supabase.from("brands").select("id, name, active").order("name"),
  ]);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Categorias e marcas</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Categorias</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <form action={saveCategory} className="flex flex-wrap gap-2">
              <Input name="name" placeholder="Nova categoria…" required />
              <Button type="submit" variant="secondary">Adicionar</Button>
            </form>
            <ul className="grid gap-1 text-sm">
              {(categories ?? []).map((c) => (
                <li key={c.id} className="rounded border px-3 py-2">{c.name}</li>
              ))}
              {(categories ?? []).length === 0 && (
                <li className="text-muted-foreground">Nenhuma categoria.</li>
              )}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Marcas</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <form action={saveBrand} className="flex flex-wrap gap-2">
              <Input name="name" placeholder="Nova marca…" required />
              <Button type="submit" variant="secondary">Adicionar</Button>
            </form>
            <ul className="grid gap-1 text-sm">
              {(brands ?? []).map((b) => (
                <li key={b.id} className="rounded border px-3 py-2">{b.name}</li>
              ))}
              {(brands ?? []).length === 0 && (
                <li className="text-muted-foreground">Nenhuma marca.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

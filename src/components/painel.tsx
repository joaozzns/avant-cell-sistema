import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* Pilula de atalho. `tom` marca o que exige atencao — no painel de referencia
   os alertas aparecem misturados aos atalhos, e a cor e o que os separa. */
export function Atalho({
  href,
  children,
  icone: Icone,
  tom = "neutro",
}: {
  href: string;
  children: React.ReactNode;
  icone?: React.ComponentType<{ className?: string }>;
  tom?: "neutro" | "primario" | "alerta" | "aviso";
}) {
  const tons = {
    neutro: "border-border bg-card text-foreground hover:border-primary hover:text-primary",
    primario: "border-transparent bg-primary text-primary-foreground hover:brightness-110",
    alerta: "border-destructive/30 bg-destructive/8 text-destructive hover:bg-destructive/15",
    aviso: "border-primary/30 bg-primary/8 text-primary hover:bg-primary/15",
  };
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-all",
        tons[tom]
      )}
    >
      {Icone && <Icone className="h-4 w-4 shrink-0" />}
      {children}
    </Link>
  );
}

/* Bloco de indicador cheio, como as caixas azuis da direita na referencia. */
export function Indicador({
  valor,
  rotulo,
  href,
  icone: Icone,
  tom = "primario",
}: {
  valor: string | number;
  rotulo: string;
  href: string;
  icone: React.ComponentType<{ className?: string }>;
  tom?: "primario" | "acento" | "sucesso" | "perigo";
}) {
  const tons = {
    primario: "bg-primary",
    acento: "bg-chart-2",
    sucesso: "bg-success",
    perigo: "bg-destructive",
  };
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl p-5 text-white transition-transform hover:-translate-y-0.5",
        tons[tom]
      )}
    >
      <Icone className="pointer-events-none absolute -right-3 -top-2 h-24 w-24 opacity-15" />
      <div className="relative">
        <p className="text-3xl font-bold leading-none">{valor}</p>
        <p className="mt-1.5 text-sm text-white/85">{rotulo}</p>
      </div>
      <span className="relative mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-white/90">
        Ver detalhes
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

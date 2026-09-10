import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export function Breadcrumb({
  trilha,
}: {
  trilha: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Você está aqui" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <li>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 transition-colors hover:text-primary"
          >
            <Home className="h-4 w-4" />
            Tela inicial
          </Link>
        </li>
        {trilha.map((p) => (
          <li key={p.label} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            {p.href ? (
              <Link href={p.href} className="transition-colors hover:text-primary">
                {p.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{p.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

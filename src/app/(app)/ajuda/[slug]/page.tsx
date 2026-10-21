import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { ARTIGOS, porSlug } from "@/lib/ajuda";
import { Corpo } from "../blocos";

export function generateStaticParams() {
  return ARTIGOS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: porSlug(slug)?.titulo ?? "Ajuda" };
}

export default async function ArtigoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artigo = porSlug(slug);
  if (!artigo) notFound();

  const doMesmoModulo = ARTIGOS.filter((a) => a.modulo === artigo.modulo && a.slug !== artigo.slug);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <Link href="/ajuda" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Ajuda
      </Link>

      <header className="grid gap-1.5 border-b pb-5">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">{artigo.modulo}</span>
        <h1 className="text-2xl font-bold tracking-tight">{artigo.titulo}</h1>
        <p className="text-muted-foreground">{artigo.resumo}</p>
      </header>

      <Corpo blocos={artigo.corpo} />

      <Link
        href={artigo.telas[0]}
        className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
      >
        Ir para a tela
        <ExternalLink className="h-4 w-4" />
      </Link>

      {doMesmoModulo.length > 0 && (
        <section className="grid gap-2 border-t pt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Também em {artigo.modulo}
          </h2>
          {doMesmoModulo.map((a) => (
            <Link key={a.slug} href={`/ajuda/${a.slug}`}
              className="group flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:border-primary">
              <span className="font-medium group-hover:text-primary">{a.titulo}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

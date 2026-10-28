import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* A marca entra como imagem, não como texto. Duas versões: o
              contorno escuro some no tema escuro e a branca entra no lugar,
              trocadas por CSS para não piscar na carga. O h1 continua aqui,
              com o nome no alt, para quem usa leitor de tela e para o
              buscador — a página não pode perder o título por virar figura. */}
          <h1 className="sr-only">Avant Cell</h1>
          <Image
            src="/logo-escura.svg"
            alt="Avant Cell"
            width={199}
            height={48}
            priority
            className="h-11 w-auto dark:hidden"
          />
          <Image
            src="/logo-branca.svg"
            alt="Avant Cell"
            width={199}
            height={48}
            priority
            className="hidden h-11 w-auto dark:block"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Loja e assistência técnica de celulares
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

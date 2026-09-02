export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">AVANT CELL</h1>
          <p className="text-sm text-muted-foreground">
            Loja e assistência técnica de celulares
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

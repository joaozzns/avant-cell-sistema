import "./impressao.css";

/* Páginas de impressão ficam fora do painel (sem barra lateral e cabeçalho). */
export default function ImprimirLayout({ children }: { children: React.ReactNode }) {
  return <div className="impressao">{children}</div>;
}

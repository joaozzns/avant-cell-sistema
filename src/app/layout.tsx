import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

/* Mesma familia da marca e do site publico. A variavel precisa chamar-se
   --font-sans: e o nome que globals.css mapeia em @theme. Antes ela era
   --font-geist-sans e nunca casava, o que jogava tudo na serifa padrao. */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "AVANT CELL", statusBarStyle: "default" },
  title: "AVANT CELL",
  description: "Sistema de gestão para loja e assistência técnica de celulares",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><SwRegister />
        {children}</body>
    </html>
  );
}

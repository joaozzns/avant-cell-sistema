import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><SwRegister />
        {children}</body>
    </html>
  );
}

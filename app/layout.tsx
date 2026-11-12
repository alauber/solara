import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solara OS",
  description: "Sistema operacional da Solara Distribuidora",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

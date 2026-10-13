import type { Metadata } from "next";
import { connection } from "next/server";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

export const metadata: Metadata = {
  title: "DMC Contingencia",
  description: "Sistema de técnicos en terreno y panel de coordinación de Grupo DMC",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // El nonce de la CSP se genera por petición: la página no puede prerenderse
  // estática o sus scripts saldrían sin él.
  await connection();
  return (
    <html lang="es" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

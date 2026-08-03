import type { Metadata, Viewport } from "next";
import { Inter, Sora, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Visitas técnicas · DMC",
  description: "Registro de visitas técnicas en terreno",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f7fc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-CL" className={cn("h-full", "antialiased", inter.variable, sora.variable, "font-sans", geist.variable)}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

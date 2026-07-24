import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/*
 * next/font descarga las fuentes en tiempo de build y las sirve desde el propio
 * dominio. En una demo sobre el wifi de un hackathon eso no es un detalle: es la
 * diferencia entre que la tipografía cargue o que no.
 */

const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const sans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chispy — mira lo que tus clientes ya te dijeron",
  description:
    "Chispy toma la base de clientes de una pyme, la enriquece con datos públicos de Bogotá y decide a quién contactar esta semana, con qué oferta y con qué mensaje.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${mono.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

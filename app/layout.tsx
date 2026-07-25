import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/*
 * next/font descarga las fuentes en tiempo de build y las sirve desde el propio
 * dominio. En una demo sobre el wifi de un hackathon eso no es un detalle: es la
 * diferencia entre que la tipografía cargue o que no.
 */

/*
 * Archivo se pide con su eje de ancho variable porque aquí el ancho es
 * significado: las cifras de un tablero de instrumentos son anchas, nunca
 * condensadas — se leen desde lejos y de reojo. Todo lo que grita en esta
 * pantalla (el wordmark, la plata) va expandido.
 */
const display = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
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

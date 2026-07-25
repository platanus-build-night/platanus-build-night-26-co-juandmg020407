/**
 * El briefing hablado, bajo demanda.
 *
 * Solo se llama cuando alguien pulsa "Escuchar resumen": ni al cargar la página,
 * ni al terminar el análisis, ni al volver a darle al play. Cada llamada cuesta
 * créditos reales de una cuenta con muy pocos, así que la ruta es lo más
 * aburrida posible — valida, sintetiza una vez, devuelve el MP3.
 *
 * No es un proxy de texto a voz abierto: solo pronuncia briefings que este mismo
 * servidor firmó (ver `lib/voz/firma.ts`).
 */

import { MAX_CARACTERES_BRIEFING } from "@/lib/voz/briefing.ts";
import { sintetizar, vozConfigurada } from "@/lib/voz/elevenlabs.ts";
import { firmaValida } from "@/lib/voz/firma.ts";

export const runtime = "nodejs";

/** La UI lo consulta para saber si pintar el botón o esconderlo. */
export async function GET() {
  return Response.json({ disponible: vozConfigurada() });
}

export async function POST(req: Request) {
  if (!vozConfigurada()) {
    return Response.json(
      { ok: false, motivo: "La voz no está activada en este entorno." },
      { status: 503 },
    );
  }

  let cuerpo: { texto?: unknown; firma?: unknown };
  try {
    cuerpo = (await req.json()) as typeof cuerpo;
  } catch {
    return Response.json({ ok: false, motivo: "Petición ilegible." }, { status: 400 });
  }

  const texto = typeof cuerpo.texto === "string" ? cuerpo.texto.trim() : "";
  const firma = typeof cuerpo.firma === "string" ? cuerpo.firma : "";

  if (!texto) {
    return Response.json({ ok: false, motivo: "No llegó ningún texto." }, { status: 400 });
  }

  if (texto.length > MAX_CARACTERES_BRIEFING) {
    return Response.json(
      { ok: false, motivo: "El briefing supera el máximo de caracteres." },
      { status: 413 },
    );
  }

  // El portero. Sin firma válida no se gasta un solo crédito.
  if (!firmaValida(texto, firma)) {
    return Response.json(
      { ok: false, motivo: "Este texto no lo generó Chispy." },
      { status: 403 },
    );
  }

  const resultado = await sintetizar(texto);

  if (!resultado.ok) {
    return Response.json({ ok: false, motivo: resultado.motivo }, { status: resultado.estado });
  }

  return new Response(resultado.audio, {
    headers: {
      "Content-Type": resultado.tipo,
      "Content-Length": String(resultado.audio.byteLength),
      // El navegador ya guarda el blob en memoria; cachearlo aquí solo serviría
      // para servir el briefing de otro análisis.
      "Cache-Control": "no-store",
    },
  });
}

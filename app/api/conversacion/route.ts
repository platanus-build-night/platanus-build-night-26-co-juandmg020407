/**
 * El hilo de WhatsApp, para poder verlo en la pantalla.
 *
 * El mejor momento de la demo pasaba fuera de la proyección: el agente enviaba
 * el WhatsApp y la respuesta de Valentina solo existía en un celular que nadie
 * en la sala puede ver. Esta ruta trae ese hilo a la pantalla.
 *
 * Decisiones que importan:
 * - La conversación se lee de Twilio, igual que la memoria de Valentina
 *   (`app/api/whatsapp/entrante/route.ts`). Cero base de datos, cero estado nuevo.
 * - Solo el hilo con el número de prueba del guardarraíl. Es lo único que la
 *   demo enseña, y así no hay forma de que esta ruta filtre otras conversaciones.
 * - Fuera todo lo que identifique: ni números, ni SIDs. Sale el rol, el texto y
 *   la hora, que es lo que se pinta.
 * - Nunca un 500: si faltan credenciales o Twilio falla, se responde con el hilo
 *   vacío y el panel se esconde solo. Un error aquí no puede tumbar la demo.
 */

import twilio from "twilio";
import { normalizarCelular } from "@/lib/ingesta/csv.ts";

export const runtime = "nodejs";

/** Cuántos mensajes se devuelven. Más no caben en el panel sin hacer scroll. */
const LIMITE = 20;

export type MensajeHilo = {
  rol: "negocio" | "cliente";
  texto: string;
  hora: string;
  /**
   * Cuándo se creó, en milisegundos. La pantalla lo necesita para poder dejar
   * atrás las conversaciones de los ensayos: el hilo vive en Twilio y no se
   * borra, así que limpiar es marcar desde dónde se mira. No identifica a
   * nadie — la hora ya sale escrita en la burbuja.
   */
  ts: number;
};

/**
 * El eco del sandbox de Twilio: cuando el webhook de entrada no está apuntado a
 * este proyecto, el sandbox responde solo con un "You said…" y una instrucción
 * de configuración. No es parte de la conversación y en pantalla es ruido.
 */
const ECO_SANDBOX = "Configure your WhatsApp Sandbox";

/** La hora tal y como sale en el celular de la sala: Bogotá y 12 horas. */
function horaEnBogota(fecha: Date | null | undefined): string {
  if (!fecha) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(fecha);
}

function hilo(mensajes: MensajeHilo[]): Response {
  // El panel pregunta cada dos segundos: nada de esto se puede cachear.
  return Response.json({ mensajes }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const desde = process.env.TWILIO_WHATSAPP_FROM;
  const prueba = normalizarCelular(process.env.TWILIO_WHATSAPP_TEST ?? "");

  if (!sid || !token || !desde || !prueba) return hilo([]);

  const contra = `whatsapp:${prueba}`;

  try {
    const cliente = twilio(sid, token);
    const [enviados, recibidos] = await Promise.all([
      cliente.messages.list({ from: desde, to: contra, limit: LIMITE }),
      cliente.messages.list({ from: contra, to: desde, limit: LIMITE }),
    ]);

    const mensajes = [...enviados, ...recibidos]
      .filter((m) => m.body?.trim() && !m.body.includes(ECO_SANDBOX))
      .sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime())
      .slice(-LIMITE)
      .map((m) => ({
        rol: m.from === desde ? ("negocio" as const) : ("cliente" as const),
        texto: m.body.trim(),
        hora: horaEnBogota(m.dateCreated),
        ts: m.dateCreated ? new Date(m.dateCreated).getTime() : 0,
      }));

    return hilo(mensajes);
  } catch (error) {
    console.error("conversacion:", error);
    // Hilo vacío antes que un 500: el panel se esconde y la demo sigue igual.
    return hilo([]);
  }
}

/**
 * El WhatsApp entrante: aquí vive Valentina.
 *
 * El dolor que ataca la demo: las campañas traen leads al WhatsApp, el negocio
 * los atiende con un chatbot de flujo, el cliente huele el bot y deja de
 * responder. Valentina es lo contrario: responde como una asesora que escribe
 * de verdad — corto, cálido, con memoria del hilo — y empuja hacia el canal
 * donde la joyería cierra: la videollamada.
 *
 * Decisiones que importan:
 * - La memoria del hilo se lee de la propia API de Twilio (los últimos mensajes
 *   en ambas direcciones). Cero base de datos, cero estado que se desincronice.
 * - Solo se responde al número de prueba del guardarraíl. Cualquier otro
 *   remitente recibe silencio: una demo no es lugar para conversaciones
 *   abiertas con desconocidos.
 * - La petición se valida con la firma de Twilio: este endpoint es público y
 *   sin la firma cualquiera podría hacerle decir cosas a Valentina.
 * - Honestidad: Valentina no anuncia que es una IA, pero si se lo preguntan
 *   directamente no miente. El jurado puede preguntárselo.
 */

import twilio from "twilio";
import Anthropic from "@anthropic-ai/sdk";
import { normalizarCelular } from "@/lib/ingesta/csv.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODELO = process.env.CHISPY_MODELO ?? "claude-opus-5";

const VALENTINA = `Eres Valentina, asesora comercial de Joyería Áurea, una joyería de Bogotá que vende sobre todo por videollamada. Atiendes el WhatsApp del negocio.

Cómo escribes:
- Como una persona real en WhatsApp: una a tres frases, español colombiano, tuteo cálido.
- Nada de listas, numeraciones, asteriscos ni párrafos largos. Máximo un emoji, y no siempre.
- Responde a lo que te preguntaron. No sueltes catálogo sin que te lo pidan.

Tu objetivo: que la conversación no se enfríe y llevarla con naturalidad a agendar una videollamada de 15 minutos para ver piezas en vivo. Cuando tenga sentido, propone dos franjas concretas y cercanas.

Reglas:
- Precios: si preguntan, da rangos honestos (argollas de matrimonio desde $1.200.000; anillos de compromiso entre $2.500.000 y $15.000.000 según oro y piedra) y deja el detalle para la videollamada.
- No inventes inventario concreto, referencias ni tiempos de entrega. Si no lo sabes: "eso te lo confirmo en la videollamada".
- Si te preguntan directamente si eres un bot o una inteligencia artificial, no mientas: di con gracia que eres la asistente digital de Áurea y que justamente por eso la videollamada es con una persona del taller. No lo anuncies si no te lo preguntan.
- Si escriben algo fuera de tema, responde breve y amable y vuelve a la joyería.`;

function twiml(mensaje?: string): Response {
  const cuerpo = mensaje
    ? `<Response><Message>${escaparXml(mensaje)}</Message></Response>`
    : "<Response/>";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${cuerpo}`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function escaparXml(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Hora local de Bogotá, para que las franjas que proponga tengan sentido. */
function ahoraEnBogota(): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
}

export async function POST(req: Request) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const desde = process.env.TWILIO_WHATSAPP_FROM;
  const prueba = normalizarCelular(process.env.TWILIO_WHATSAPP_TEST ?? "");

  if (!sid || !token || !desde) return twiml();

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  // La firma se calcula sobre la URL pública exacta que Twilio tiene guardada.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const url = `https://${host}/api/whatsapp/entrante`;
  const firma = req.headers.get("x-twilio-signature") ?? "";

  if (!twilio.validateRequest(token, firma, url, params)) {
    console.error("whatsapp/entrante: firma de Twilio inválida para", url);
    return new Response("firma inválida", { status: 403 });
  }

  const remitente = params.From ?? "";
  const texto = (params.Body ?? "").trim();

  // Guardarraíl: Valentina solo conversa con el número de prueba.
  if (!prueba || remitente !== `whatsapp:${prueba}` || !texto) {
    return twiml();
  }

  try {
    /*
     * La memoria del hilo vive en Twilio: últimos mensajes en ambas
     * direcciones, ordenados por fecha. El mensaje que dispara este webhook ya
     * está registrado, así que se excluye por SID para no duplicarlo.
     */
    const cliente = twilio(sid, token);
    const [enviados, recibidos] = await Promise.all([
      cliente.messages.list({ from: desde, to: remitente, limit: 12 }),
      cliente.messages.list({ from: remitente, to: desde, limit: 12 }),
    ]);

    const hilo = [...enviados, ...recibidos]
      .filter((m) => m.sid !== params.MessageSid && m.body?.trim())
      .sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime())
      .slice(-14)
      .map((m) => ({
        role: m.from === desde ? ("assistant" as const) : ("user" as const),
        content: m.body,
      }));

    const anthropic = new Anthropic();
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 400,
      system: `${VALENTINA}\n\nAhora mismo en Bogotá es ${ahoraEnBogota()}.`,
      output_config: { effort: "low" },
      messages: [...hilo, { role: "user", content: texto }],
    });

    if (respuesta.stop_reason === "refusal") {
      return twiml("Dame un momentico y te confirmo eso 🙂");
    }

    const contestacion = respuesta.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    return twiml(contestacion || "Dame un momentico y te confirmo eso 🙂");
  } catch (error) {
    console.error("whatsapp/entrante:", error);
    // Silencio antes que un error crudo en el WhatsApp de alguien.
    return twiml();
  }
}

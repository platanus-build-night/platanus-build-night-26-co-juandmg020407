/**
 * Envío por WhatsApp a través del sandbox de Twilio.
 *
 * El sandbox exige que el destinatario se haya unido mandando "join <código>"
 * al número de Twilio. Si no lo ha hecho, la API acepta la petición y el mensaje
 * simplemente nunca llega — sin error visible. Por eso aquí traducimos los
 * códigos de Twilio a frases que se entienden a la primera: en mitad de una demo
 * no hay tiempo de buscar qué significa el error 63016.
 */

import twilio from "twilio";
import { normalizarCelular } from "./ingesta/csv.ts";

export type ResultadoEnvio =
  | { ok: true; sid: string; a: string }
  | { ok: false; motivo: string; pista?: string };

const DIAGNOSTICO: Record<number, { motivo: string; pista: string }> = {
  63015: {
    motivo: "Ese número no está unido al sandbox de WhatsApp.",
    pista: 'Que mande "join <tu-código>" por WhatsApp al número del sandbox y reintenta.',
  },
  63016: {
    motivo: "Fuera de la ventana de 24 horas del sandbox.",
    pista: "Que el destinatario escriba cualquier cosa al número del sandbox para reabrirla.",
  },
  63007: {
    motivo: "El número emisor no está dado de alta como canal de WhatsApp.",
    pista: "Revisa TWILIO_WHATSAPP_FROM: debe ir con el prefijo whatsapp:",
  },
  21608: {
    motivo: "En cuenta de prueba solo se puede escribir a números verificados.",
    pista: "Verifica el número en la consola de Twilio, o únelo al sandbox.",
  },
  21211: {
    motivo: "El número de destino no tiene un formato válido.",
    pista: "Debe ir en formato internacional: +57 y diez dígitos.",
  },
};

export function whatsappConfigurado(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM,
  );
}

export async function enviarWhatsapp(
  telefono: string,
  mensaje: string,
): Promise<ResultadoEnvio> {
  if (!whatsappConfigurado()) {
    return {
      ok: false,
      motivo: "WhatsApp no está configurado.",
      pista: "Faltan credenciales de Twilio en el archivo .env.",
    };
  }

  const normalizado = normalizarCelular(telefono);
  if (!normalizado) {
    return {
      ok: false,
      motivo: "Ese no parece un celular colombiano.",
      pista: "Debe empezar por 3 y tener diez dígitos.",
    };
  }

  if (!mensaje.trim()) {
    return { ok: false, motivo: "El mensaje está vacío." };
  }

  const cliente = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  try {
    const res = await cliente.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM!,
      to: `whatsapp:${normalizado}`,
      body: mensaje,
    });

    return { ok: true, sid: res.sid, a: normalizado };
  } catch (error) {
    const codigo = (error as { code?: number }).code;
    const conocido = codigo ? DIAGNOSTICO[codigo] : undefined;

    if (conocido) return { ok: false, ...conocido };

    return {
      ok: false,
      motivo: error instanceof Error ? error.message : "Falló el envío.",
      pista: codigo ? `Código de Twilio: ${codigo}` : undefined,
    };
  }
}

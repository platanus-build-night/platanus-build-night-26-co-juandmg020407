/**
 * La firma que impide que /api/voz sea un sintetizador gratis para internet.
 *
 * El texto del briefing lo compone el servidor y viaja al navegador junto a un
 * HMAC suyo. Cuando el usuario pulsa "Escuchar resumen", el navegador devuelve
 * los dos y la ruta solo sintetiza si el HMAC cuadra. Resultado: ElevenLabs solo
 * pronuncia frases que Chispy escribió, con lo que nadie puede quemar los
 * créditos de la cuenta mandando su propio texto a la URL pública.
 *
 * Es deliberadamente sin estado: no hace falta guardar análisis en ninguna
 * parte, ni Supabase, ni memoria compartida entre las lambdas de Vercel.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * El material de la firma.
 *
 * Preferimos un secreto propio, pero si no está definido servimos de la clave de
 * ElevenLabs: es un valor que solo existe en el servidor y sin el cual la voz no
 * funcionaría de todos modos. Un HMAC no revela su clave, así que reutilizarla
 * no la expone — y ahorra una variable más que configurar en Vercel a las tres
 * de la mañana.
 */
function secreto(): string | null {
  return (
    process.env.CHISPY_VOZ_SECRETO?.trim() ||
    process.env.ELEVENLABS_API_KEY?.trim() ||
    null
  );
}

/** Devuelve el HMAC del texto, o null si no hay con qué firmar. */
export function firmar(texto: string): string | null {
  const clave = secreto();
  if (!clave) return null;
  return createHmac("sha256", clave).update(texto, "utf8").digest("hex");
}

/** Comprueba la firma en tiempo constante. */
export function firmaValida(texto: string, firma: string): boolean {
  const esperada = firmar(texto);
  if (!esperada || !firma) return false;

  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(firma, "utf8");

  // timingSafeEqual exige longitudes iguales; si no lo son ya sabemos que falla.
  return a.length === b.length && timingSafeEqual(a, b);
}

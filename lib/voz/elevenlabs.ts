/**
 * La voz, contra la API HTTP oficial de ElevenLabs.
 *
 * Vamos a `fetch` en vez de al SDK a propósito: es una sola llamada, la
 * respuesta es un binario, y así no entra otra dependencia (ni otro árbol de
 * `node_modules`) en una función serverless que ya arrastra Twilio y el SDK de
 * Anthropic.
 *
 * Como en `whatsapp.ts`, los errores del proveedor se traducen a frases que se
 * entienden a la primera: en mitad de una demo nadie tiene tiempo de averiguar
 * qué significa un 401 con `quota_exceeded`.
 *
 * La clave vive SOLO aquí. Este módulo se importa únicamente desde rutas de
 * servidor; nada de lo que exporta llega al bundle del navegador.
 */

const API = "https://api.elevenlabs.io/v1/text-to-speech";

/**
 * Voz y modelo por defecto, verificados con el MCP oficial de ElevenLabs sobre
 * esta misma cuenta. Las variables de entorno mandan sobre estos valores: si
 * mañana la voz cambia de dueño o el plan deja de incluir el modelo, se arregla
 * en Vercel sin tocar el código.
 */
const VOZ_POR_DEFECTO = "";
const MODELO_POR_DEFECTO = "eleven_flash_v2_5";

/** El TTS no puede colgar el botón: pasado este tiempo se corta y se avisa. */
const TIMEOUT_MS = 25_000;

export type ResultadoVoz =
  | { ok: true; audio: ArrayBuffer; tipo: string }
  | { ok: false; motivo: string; estado: number };

/** La voz es opcional: Chispy funciona igual sin ella. */
export function vozConfigurada(): boolean {
  return Boolean(
    process.env.ELEVENLABS_ENABLED === "true" &&
      process.env.ELEVENLABS_API_KEY?.trim() &&
      (process.env.ELEVENLABS_VOICE_ID?.trim() || VOZ_POR_DEFECTO),
  );
}

/** Traduce el cuerpo de error de ElevenLabs a algo que el dueño entienda. */
function diagnosticar(estado: number, cuerpo: string): string {
  let codigo = "";
  try {
    const json = JSON.parse(cuerpo) as { detail?: { status?: string } | string };
    codigo = typeof json.detail === "string" ? json.detail : (json.detail?.status ?? "");
  } catch {
    // Cuerpo no-JSON: nos quedamos con el código HTTP.
  }

  if (codigo === "quota_exceeded") return "Se acabaron los créditos de voz de la cuenta.";
  if (codigo === "voice_not_found") return "La voz configurada ya no existe.";
  if (codigo === "invalid_api_key" || estado === 401)
    return "La cuenta de voz rechazó la credencial.";
  if (estado === 429) return "Demasiadas peticiones de voz seguidas. Espera unos segundos.";
  if (estado === 422) return "ElevenLabs rechazó el texto o el modelo configurado.";
  return "El servicio de voz no respondió bien.";
}

/**
 * Sintetiza el briefing. Nunca lanza: quien la llama decide qué hacer con el
 * fallo, y el fallo jamás debe tumbar el análisis que ya está en pantalla.
 */
export async function sintetizar(texto: string): Promise<ResultadoVoz> {
  const clave = process.env.ELEVENLABS_API_KEY?.trim();
  const voz = process.env.ELEVENLABS_VOICE_ID?.trim() || VOZ_POR_DEFECTO;
  const modelo = process.env.ELEVENLABS_MODEL_ID?.trim() || MODELO_POR_DEFECTO;

  if (!clave || !voz) {
    return { ok: false, motivo: "La voz no está configurada en este entorno.", estado: 503 };
  }

  try {
    const res = await fetch(`${API}/${encodeURIComponent(voz)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": clave },
      body: JSON.stringify({
        text: texto,
        model_id: modelo,
        language_code: "es",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      // El cuerpo se lee para diagnosticar, nunca se devuelve tal cual: puede
      // traer detalles de la cuenta que no pintan nada en el navegador.
      const motivo = diagnosticar(res.status, await res.text().catch(() => ""));
      console.error(`[voz] ElevenLabs respondió ${res.status}: ${motivo}`);
      return { ok: false, motivo, estado: 502 };
    }

    return {
      ok: true,
      audio: await res.arrayBuffer(),
      tipo: res.headers.get("content-type") ?? "audio/mpeg",
    };
  } catch (error) {
    const abortado = error instanceof Error && error.name === "TimeoutError";
    console.error("[voz] falló la síntesis:", error instanceof Error ? error.name : error);
    return {
      ok: false,
      motivo: abortado ? "La voz tardó demasiado en generarse." : "No se pudo contactar el servicio de voz.",
      estado: 504,
    };
  }
}

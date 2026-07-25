/**
 * El pipeline completo, emitido como stream de eventos NDJSON.
 *
 * Una línea de JSON por evento. El cliente lo lee con un reader y pinta según
 * llega, en vez de esperar a que termine todo. Es lo que convierte 40 segundos
 * de spinner en una pantalla que se ve trabajar.
 */

import { parsearCsv } from "@/lib/ingesta/csv.ts";
import { resolverZona } from "@/lib/data/bogota.ts";
import { calcularRfm } from "@/lib/enriquecimiento/rfm.ts";
import { ejecutarAgente } from "@/lib/agente/agente.ts";
import { construirBriefing } from "@/lib/voz/briefing.ts";
import { firmar } from "@/lib/voz/firma.ts";
import type { ClienteEnriquecido, EventoChispy, Fuente } from "@/lib/tipos.ts";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Milisegundos entre cliente y cliente en la cascada.
 *
 * El enriquecimiento es local e instantáneo: sin esto, 40 clientes aparecen en
 * un fotograma y no se lee nada. El retardo es para el ojo humano, no porque el
 * trabajo tarde. Ponlo a 0 y el resultado es idéntico, solo ilegible.
 */
const RITMO_MS = Number(process.env.CHISPY_RITMO_MS ?? 40);

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const { csv, negocio } = (await req.json()) as { csv?: string; negocio?: string };

  if (!csv?.trim()) {
    return Response.json({ error: "No llegó ningún CSV." }, { status: 400 });
  }

  const codificador = new TextEncoder();

  const stream = new ReadableStream({
    async start(controlador) {
      // El briefing hablado necesita saber si el agente llegó a enviar algo de
      // verdad; se cuenta aquí, de paso, en vez de cambiar la firma del agente.
      let enviosReales = 0;
      let enviosSimulados = 0;

      const emitir = (evento: EventoChispy) => {
        if (evento.tipo === "whatsapp") {
          if (evento.estado === "enviado") enviosReales += 1;
          else enviosSimulados += 1;
        }
        controlador.enqueue(codificador.encode(JSON.stringify(evento) + "\n"));
      };

      try {
        const { clientes, avisos } = parsearCsv(csv);

        if (clientes.length === 0) {
          emitir({ tipo: "error", mensaje: "El CSV no tiene filas legibles." });
          controlador.close();
          return;
        }

        emitir({ tipo: "inicio", totalClientes: clientes.length });
        for (const aviso of avisos) emitir({ tipo: "error", mensaje: aviso });

        emitir({ tipo: "fase", nombre: "Enriqueciendo por zona y comportamiento" });

        const enriquecidos: ClienteEnriquecido[] = [];

        for (const [indice, cliente] of clientes.entries()) {
          const zona = resolverZona(cliente.barrioRaw);
          const rfm = calcularRfm(cliente);

          // Cada dato enriquecido lleva su procedencia. Es lo que permite decir
          // "todo es trazable" en lugar de pedir fe.
          const fuentes: Fuente[] = [
            {
              campo: "rfm",
              origen: "historial de compras del propio negocio",
              confianza: rfm.segmento === "sin_datos" ? "fallida" : "exacta",
            },
          ];

          if (zona.confianza !== "fallida") {
            fuentes.push(
              {
                campo: "estrato",
                origen: `estratificación Bogotá D.C. — ${zona.via}`,
                confianza: zona.confianza,
              },
              {
                campo: "ingresoHogarPromedio",
                origen: "estimación por estrato (orden de magnitud, no medición)",
                confianza: "derivada",
              },
            );
          }

          const enriquecido: ClienteEnriquecido = { ...cliente, zona, rfm, fuentes };
          enriquecidos.push(enriquecido);

          emitir({ tipo: "cliente", cliente: enriquecido, indice });
          if (RITMO_MS > 0) await esperar(RITMO_MS);
        }

        emitir({ tipo: "fase", nombre: "El agente está decidiendo a quién contactar" });

        const nombreNegocio = negocio?.trim() || "una pyme de Bogotá";
        const { plan } = await ejecutarAgente(enriquecidos, nombreNegocio, emitir);

        /*
         * El guion del briefing se redacta aquí, sin volver a llamar al modelo:
         * sale del plan que el agente acaba de entregar. Si algo fallara al
         * componerlo, el análisis ya está entero en pantalla y solo se pierde el
         * botón de voz — nunca al revés.
         */
        try {
          const texto = construirBriefing({
            negocio: nombreNegocio,
            clientes: enriquecidos,
            plan,
            enviosReales,
            enviosSimulados,
          });
          emitir({ tipo: "briefing", texto, firma: firmar(texto) });
        } catch {
          // Sin briefing no hay botón de voz. El resto de la demo sigue igual.
        }

        emitir({ tipo: "fin" });
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        emitir({ tipo: "error", mensaje });
        emitir({ tipo: "fin" });
      } finally {
        controlador.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

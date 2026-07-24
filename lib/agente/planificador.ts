/**
 * El agente comercial de Chispy.
 *
 * Recibe la base de clientes ya enriquecida y decide: a quién contactar, con qué
 * oferta, por qué canal y con qué mensaje exacto.
 *
 * DOS DECISIONES DE DISEÑO QUE IMPORTAN:
 *
 * 1. El razonamiento se emite mientras ocurre (`display: "summarized"`), no al
 *    final. En la demo se ve al agente pensar en vez de un spinner mudo.
 *
 * 2. La salida va por structured outputs con esquema JSON, no por "devuélveme
 *    JSON y reza". El plan siempre parsea o falla ruidosamente — nunca a medias.
 *
 * El prompt prohíbe explícitamente inventar datos. Es la diferencia entre una
 * demo que aguanta que el jurado meta su propio caso y una que se desmonta.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ClienteEnriquecido, PlanComercial, EventoChispy } from "../tipos.ts";
import { ETIQUETAS_RFM, PRIORIDAD_RFM } from "../enriquecimiento/rfm.ts";

const MODELO = process.env.CHISPY_MODELO ?? "claude-opus-5";
/** `medium` en demo: el plan sale en la mitad de tiempo y la calidad aguanta. */
const ESFUERZO = (process.env.CHISPY_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

const ESQUEMA_PLAN = {
  type: "object",
  properties: {
    /*
     * PRIMERO A PROPÓSITO. El modelo genera el JSON en el orden del esquema, así
     * que estas frases salen antes que el resto y se pintan mientras el plan se
     * sigue escribiendo.
     *
     * Empezamos apoyándonos en los bloques de thinking, pero medimos: Sonnet 5
     * no piensa en esta tarea ni a effort high, y Opus 5 sí pero tarda 75 s. Con
     * una demo de dos minutos, ninguna de las dos servía. Esto da el mismo
     * razonamiento visible en 20 s y sin depender de que el modelo decida pensar.
     */
    analisis: {
      type: "array",
      items: { type: "string" },
      description:
        "Entre 4 y 7 frases en primera persona, contando tu análisis según lo haces: qué miras, qué te llama la atención, qué descartas y por qué. Cada frase debe citar un dato concreto de la tabla. Escribe como quien piensa en voz alta, no como quien redacta un informe.",
    },
    resumen: {
      type: "string",
      description:
        "Dos o tres frases para el dueño del negocio: qué encontraste y qué debería hacer primero. Sin jerga.",
    },
    segmentos: {
      type: "array",
      description: "Entre 2 y 4 segmentos, ordenados por urgencia comercial.",
      items: {
        type: "object",
        properties: {
          nombre: {
            type: "string",
            description: 'Nombre corto y evocador. Ej: "Se nos están yendo los buenos".',
          },
          descripcion: {
            type: "string",
            description: "Una frase: quiénes son y por qué están juntos.",
          },
          clienteIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs exactos de la lista recibida. No inventes IDs.",
          },
          oferta: {
            type: "string",
            description: "La acción comercial concreta. Específica, no genérica.",
          },
          canal: {
            type: "string",
            enum: ["whatsapp", "correo", "llamada"],
          },
          mensaje: {
            type: "string",
            description:
              "El mensaje literal a enviar, en español colombiano, tuteando. Usa {{nombre}} donde vaya el nombre del cliente. Máximo 3 frases. Sin emojis excesivos, sin sonar a robot.",
          },
          justificacion: {
            type: "string",
            description:
              "Por qué este segmento merece esta oferta, citando los datos concretos que lo respaldan.",
          },
        },
        required: [
          "nombre",
          "descripcion",
          "clienteIds",
          "oferta",
          "canal",
          "mensaje",
          "justificacion",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["analisis", "resumen", "segmentos"],
  additionalProperties: false,
} as const;

/**
 * Saca las frases ya completas del array `analisis` de un JSON a medio llegar.
 *
 * El regex solo captura cadenas con su comilla de cierre, así que una frase a
 * medio escribir simplemente no aparece todavía — y aparecerá entera en la
 * siguiente pasada. Si esto fallara, el JSON completo se parsea igual al final:
 * se pierde el efecto en vivo, nunca el contenido.
 */
function extraerAnalisis(buffer: string): string[] {
  const marca = buffer.indexOf('"analisis"');
  if (marca === -1) return [];

  const abre = buffer.indexOf("[", marca);
  if (abre === -1) return [];

  const cierra = buffer.indexOf("]", abre);
  const dentro = buffer.slice(abre + 1, cierra === -1 ? undefined : cierra);

  const frases: string[] = [];
  for (const [, cruda] of dentro.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    try {
      frases.push(JSON.parse(`"${cruda}"`) as string);
    } catch {
      /* fragmento con escapes a medias: llegará entero en la siguiente pasada */
    }
  }
  return frases;
}

const SISTEMA = `Eres el analista comercial de una pyme colombiana. Tu trabajo es mirar su base de clientes y decidir a quién contactar esta semana, con qué oferta y con qué mensaje exacto.

REGLA INVIOLABLE: solo puedes afirmar lo que está en los datos que recibes. No inventes gustos, profesiones, edades, intereses, motivos de compra ni nada que no esté en la tabla. Si un dato falta, trabaja sin él. Un plan honesto con menos información vale más que uno inventado.

Sobre el estrato: es un dato de la ZONA donde vive el cliente, asignado al inmueble por la administración distrital. Nunca es un dato de la persona. Úsalo para calibrar capacidad de gasto de un grupo, jamás para afirmar algo sobre alguien en particular.

Cómo pensar:
- Prioriza por dinero en riesgo, no por número de clientes. Diez clientes buenos que se están yendo importan más que treinta que acaban de llegar.
- Cruza el comportamiento de compra con la zona: un cliente de estrato alto que dejó de venir vale más recuperarlo que uno de ticket bajo.
- Cada segmento debe tener una razón de existir que el dueño entienda en una frase.

Cómo escribir los mensajes:
- Español colombiano, tuteo, tono de negocio de barrio que conoce a su gente.
- Concreto: menciona el motivo real del contacto. Nada de "¡Te extrañamos!" a secas.
- Máximo tres frases. La gente lee WhatsApp de pie y con prisa.
- Usa {{nombre}} exactamente así donde deba ir el nombre.`;

/** Tabla compacta: todo lo que el agente necesita, nada de ruido. */
function construirTabla(clientes: ClienteEnriquecido[]): string {
  const filas = clientes.map((c) => {
    const zona = c.zona.confianza === "fallida" ? "zona?" : `${c.zona.localidad} e${c.zona.estratoPredominante}`;
    const recencia = c.rfm.recenciaDias === null ? "?" : `${c.rfm.recenciaDias}d`;
    return [
      c.id,
      c.nombre ?? "(sin nombre)",
      zona,
      ETIQUETAS_RFM[c.rfm.segmento],
      `${c.rfm.frecuencia} compras`,
      `$${Math.round(c.rfm.monto).toLocaleString("es-CO")}`,
      `última ${recencia}`,
    ].join(" | ");
  });

  return ["id | nombre | zona/estrato | estado | frecuencia | total | recencia", ...filas].join("\n");
}

function construirContexto(clientes: ClienteEnriquecido[], negocio: string): string {
  const conteo = new Map<string, number>();
  for (const c of clientes) {
    conteo.set(c.rfm.segmento, (conteo.get(c.rfm.segmento) ?? 0) + 1);
  }

  const distribucion = PRIORIDAD_RFM.filter((s) => conteo.has(s))
    .map((s) => `${ETIQUETAS_RFM[s]}: ${conteo.get(s)}`)
    .join(", ");

  const valorTotal = clientes.reduce((suma, c) => suma + c.rfm.monto, 0);

  return `Negocio: ${negocio}
Clientes en la base: ${clientes.length}
Facturación histórica registrada: $${Math.round(valorTotal).toLocaleString("es-CO")}
Distribución por estado: ${distribucion}

TABLA DE CLIENTES
${construirTabla(clientes)}

Arma el plan comercial de esta semana.`;
}

export type ResultadoPlan = {
  plan: PlanComercial;
  razonamiento: string;
};

/**
 * Ejecuta el agente. Emite eventos de razonamiento mientras piensa para que la
 * UI los pinte en vivo; devuelve el plan validado contra el esquema.
 */
export async function planificar(
  clientes: ClienteEnriquecido[],
  negocio: string,
  onEvento?: (evento: EventoChispy) => void,
): Promise<ResultadoPlan> {
  const client = new Anthropic();
  const idsValidos = new Set(clientes.map((c) => c.id));

  onEvento?.({ tipo: "fase", nombre: "Analizando la base", detalle: `${clientes.length} clientes` });

  const stream = client.messages.stream({
    model: MODELO,
    max_tokens: 32000,
    system: SISTEMA,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: {
      effort: ESFUERZO,
      format: { type: "json_schema", schema: ESQUEMA_PLAN },
    },
    messages: [{ role: "user", content: construirContexto(clientes, negocio) }],
  });

  // Acumulamos el JSON según llega y vamos sacando las frases de análisis ya
  // completas. El plan se está escribiendo mientras el usuario lee el porqué.
  let json = "";
  let emitidas = 0;

  for await (const evento of stream) {
    if (evento.type !== "content_block_delta") continue;
    if (evento.delta.type !== "text_delta") continue;

    json += evento.delta.text;

    const frases = extraerAnalisis(json);
    for (const frase of frases.slice(emitidas)) {
      onEvento?.({ tipo: "razonamiento", texto: frase });
    }
    emitidas = Math.max(emitidas, frases.length);
  }

  const mensaje = await stream.finalMessage();

  if (mensaje.stop_reason === "refusal") {
    throw new Error("El modelo declinó la solicitud.");
  }
  if (!json.trim()) {
    throw new Error("El agente no devolvió contenido.");
  }

  const plan = JSON.parse(json) as PlanComercial;

  // Red por si el parseo incremental se quedó corto: mejor repetir una frase
  // que perderla.
  for (const frase of plan.analisis.slice(emitidas)) {
    onEvento?.({ tipo: "razonamiento", texto: frase });
  }

  // El esquema garantiza la forma, no que los IDs existan. Filtramos los
  // inventados en vez de confiar: es la última red antes de la UI.
  for (const segmento of plan.segmentos) {
    const validos = segmento.clienteIds.filter((id) => idsValidos.has(id));
    if (validos.length !== segmento.clienteIds.length) {
      onEvento?.({
        tipo: "error",
        mensaje: `Se descartaron ${segmento.clienteIds.length - validos.length} IDs inexistentes en "${segmento.nombre}".`,
      });
    }
    segmento.clienteIds = validos;
  }

  plan.segmentos = plan.segmentos.filter((s) => s.clienteIds.length > 0);

  onEvento?.({ tipo: "plan", plan });

  return { plan, razonamiento: plan.analisis.join(" ") };
}

/** Sustituye {{nombre}} por el nombre real. Primer nombre: en WhatsApp nadie usa el completo. */
export function personalizar(plantilla: string, cliente: ClienteEnriquecido): string {
  const primerNombre = (cliente.nombre ?? "").trim().split(/\s+/)[0] || "hola";
  return plantilla.replaceAll("{{nombre}}", primerNombre);
}

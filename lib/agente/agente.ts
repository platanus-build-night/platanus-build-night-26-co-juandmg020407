/**
 * El agente comercial de Chispy, versión con manos.
 *
 * El planificador original hacía UNA llamada al modelo y devolvía un plan; el
 * envío lo disparaba un humano con un botón. Esto es distinto: el modelo recibe
 * solo el resumen agregado de la base y HERRAMIENTAS. Pide los datos que
 * necesita, cuantifica lo que le preocupa, decide a quién escribir y ejecuta el
 * envío él mismo. Cada llamada a herramienta sale como evento del stream: en la
 * pantalla se ve al agente decidir, no solo redactar.
 *
 * GUARDARRAÍL DE ENVÍO, NO NEGOCIABLE: ningún mensaje sale jamás al celular de
 * un cliente. Cuando el agente decide escribirle a alguien, el envío físico va
 * SIEMPRE al número de TWILIO_WHATSAPP_TEST (el móvil que está en el escenario),
 * con un tope por corrida; sin ese número configurado, se simula y se marca. Un
 * agente autónomo escribiéndole de madrugada a cuarenta personas reales es una
 * forma nueva de perder la demo.
 */

import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import type {
  ClienteEnriquecido,
  EventoChispy,
  PlanComercial,
  SegmentoRfm,
} from "../tipos.ts";
import { ETIQUETAS_RFM, PRIORIDAD_RFM } from "../enriquecimiento/rfm.ts";
import { enviarWhatsapp } from "../whatsapp.ts";
import { normalizarCelular } from "../ingesta/csv.ts";

const MODELO = process.env.CHISPY_MODELO ?? "claude-opus-5";
/** `medium` en demo: decide en menos turnos y la calidad aguanta. */
const ESFUERZO = (process.env.CHISPY_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/** Tope de mensajes que salen de verdad por Twilio en una corrida. */
const MAX_ENVIOS_REALES = 3;

const SEGMENTOS: SegmentoRfm[] = [
  "campeon",
  "leal",
  "potencial",
  "nuevo",
  "en_riesgo",
  "dormido",
  "perdido",
  "sin_datos",
];

const SISTEMA = `Eres el agente comercial de una pyme colombiana. Tu trabajo esta noche: mirar su base de clientes, decidir a quién contactar esta semana, ESCRIBIRLE por WhatsApp al que más urge, y dejar el plan completo listo.

REGLA INVIOLABLE: solo puedes afirmar lo que está en los datos que recibes de tus herramientas. No inventes gustos, profesiones, edades, intereses ni motivos de compra. Si un dato falta, trabaja sin él.

Sobre el estrato: es un dato de la ZONA donde vive el cliente, asignado al inmueble por la administración distrital. Nunca es un dato de la persona. Úsalo para calibrar capacidad de gasto de un grupo, jamás para afirmar algo sobre alguien en particular.

Cómo decidir:
- Prioriza por dinero en riesgo, no por número de clientes.
- Cruza comportamiento con zona: recuperar a un cliente de ticket alto que se está yendo vale más que diez saludos de cortesía.
- Cada segmento del plan debe tener una razón de existir que el dueño entienda en una frase.

Cómo escribir los mensajes:
- Español colombiano, tuteo, tono de negocio de barrio que conoce a su gente.
- Concreto: menciona el motivo real del contacto. Nada de "¡Te extrañamos!" a secas.
- Máximo tres frases. La gente lee WhatsApp de pie y con prisa.
- En los mensajes que ENVÍES con enviar_whatsapp usa el primer nombre real del cliente. En las plantillas del plan usa {{nombre}} exactamente así.

Tu flujo de trabajo:
1. Con la distribución que recibes, elige los 2 o 3 estados que más importan esta semana. No recorras los ocho.
2. Examínalos con ver_clientes, solo esos. Todo segmento que vayas a incluir en el plan tiene que haber pasado antes por ver_clientes: sin IDs vistos no hay segmento.
3. Cuantifica con calcular_plata_en_riesgo el grupo que más te preocupe.
4. Elige el cliente concreto con más plata en juego y mándale su WhatsApp con enviar_whatsapp, personalizado y citando su situación real. Máximo 2 envíos en total: eres un agente con criterio, no una escopeta.
5. Entrega el plan completo con entregar_plan. Después de entregarlo responde únicamente "Listo." y termina: ni más herramientas ni más texto.

Antes de cada herramienta escribe UNA frase corta en primera persona: qué vas a mirar y por qué, citando datos concretos cuando ya los tengas. Esas frases se proyectan en directo delante del dueño.`;

/** Filas compactas, mismo formato que ya entiende bien el modelo. */
function tabla(clientes: ClienteEnriquecido[]): string {
  const filas = clientes.map((c) => {
    const zona =
      c.zona.confianza === "fallida" ? "zona?" : `${c.zona.localidad} e${c.zona.estratoPredominante}`;
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

/**
 * El contexto inicial es deliberadamente agregado: el agente NO recibe la tabla
 * completa. Si quiere ver clientes, tiene que pedirlos. Esa es la diferencia
 * entre un agente que actúa y un prompt largo.
 */
function contexto(clientes: ClienteEnriquecido[], negocio: string): string {
  const porSegmento = new Map<SegmentoRfm, { n: number; plata: number }>();
  for (const c of clientes) {
    const acc = porSegmento.get(c.rfm.segmento) ?? { n: 0, plata: 0 };
    acc.n += 1;
    acc.plata += c.rfm.monto;
    porSegmento.set(c.rfm.segmento, acc);
  }

  const distribucion = PRIORIDAD_RFM.filter((s) => porSegmento.has(s))
    .map((s) => {
      const { n, plata } = porSegmento.get(s)!;
      return `- ${ETIQUETAS_RFM[s]}: ${n} clientes, $${Math.round(plata).toLocaleString("es-CO")} de histórico`;
    })
    .join("\n");

  const valorTotal = clientes.reduce((suma, c) => suma + c.rfm.monto, 0);

  return `Negocio: ${negocio}
Clientes en la base: ${clientes.length}
Facturación histórica registrada: $${Math.round(valorTotal).toLocaleString("es-CO")}

Distribución por estado:
${distribucion}

Decide y actúa. La semana empieza ya.`;
}

const ESQUEMA_ENTREGA = {
  type: "object",
  properties: {
    resumen: {
      type: "string",
      description:
        "Dos o tres frases para el dueño: qué encontraste, qué hiciste ya y qué debería pasar después. Sin jerga.",
    },
    segmentos: {
      type: "array",
      description: "Entre 2 y 4 segmentos, ordenados por urgencia comercial.",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string", description: 'Nombre corto y evocador. Ej: "Se nos están yendo los buenos".' },
          descripcion: { type: "string", description: "Una frase: quiénes son y por qué están juntos." },
          clienteIds: {
            type: "array",
            items: { type: "string" },
            description: "IDs exactos vistos con ver_clientes. No inventes IDs.",
          },
          oferta: { type: "string", description: "La acción comercial concreta. Específica, no genérica." },
          canal: { type: "string", enum: ["whatsapp", "correo", "llamada"] },
          mensaje: {
            type: "string",
            description: "Plantilla literal con {{nombre}}, máximo 3 frases, español colombiano tuteando.",
          },
          justificacion: {
            type: "string",
            description: "Por qué este segmento merece esta oferta, citando los datos que lo respaldan.",
          },
        },
        required: ["nombre", "descripcion", "clienteIds", "oferta", "canal", "mensaje", "justificacion"],
        additionalProperties: false,
      },
    },
  },
  required: ["resumen", "segmentos"],
  additionalProperties: false,
} as const;

export type ResultadoAgente = {
  plan: PlanComercial;
  razonamiento: string;
};

export async function ejecutarAgente(
  clientes: ClienteEnriquecido[],
  negocio: string,
  onEvento?: (evento: EventoChispy) => void,
): Promise<ResultadoAgente> {
  const client = new Anthropic();
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const frases: string[] = [];
  let enviosReales = 0;
  let plan: PlanComercial | null = null;

  const emitir = (e: EventoChispy) => onEvento?.(e);

  const decir = (texto: string) => {
    frases.push(texto);
    emitir({ tipo: "razonamiento", texto });
  };

  const verClientes = betaTool({
    name: "ver_clientes",
    description:
      "Devuelve las filas de clientes de un estado RFM concreto (o todos). Es la única forma de ver clientes individuales: id, nombre, zona, estrato, frecuencia, monto histórico y recencia.",
    inputSchema: {
      type: "object",
      properties: {
        segmento: {
          type: "string",
          enum: [...SEGMENTOS, "todos"],
          description: "Estado RFM a examinar, o 'todos' para la base completa.",
        },
      },
      required: ["segmento"],
      additionalProperties: false,
    },
    run: ({ segmento }) => {
      const etiqueta = segmento === "todos" ? "toda la base" : ETIQUETAS_RFM[segmento as SegmentoRfm];
      emitir({ tipo: "herramienta", nombre: "ver_clientes", detalle: etiqueta });

      const filas =
        segmento === "todos" ? clientes : clientes.filter((c) => c.rfm.segmento === segmento);

      emitir({
        tipo: "herramienta_ok",
        nombre: "ver_clientes",
        detalle: `${etiqueta} · ${filas.length} clientes`,
      });

      if (filas.length === 0) return `No hay clientes en el estado "${etiqueta}".`;
      return tabla(filas.slice(0, 80));
    },
  });

  const calcularPlata = betaTool({
    name: "calcular_plata_en_riesgo",
    description:
      "Suma la facturación histórica de un grupo concreto de clientes. Úsala para cuantificar cuánta plata hay en juego antes de decidir.",
    inputSchema: {
      type: "object",
      properties: {
        clienteIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs exactos de los clientes del grupo.",
        },
      },
      required: ["clienteIds"],
      additionalProperties: false,
    },
    run: ({ clienteIds }) => {
      emitir({
        tipo: "herramienta",
        nombre: "calcular_plata_en_riesgo",
        detalle: `${clienteIds.length} clientes`,
      });

      const validos = clienteIds.map((id) => porId.get(id)).filter(Boolean) as ClienteEnriquecido[];
      const total = validos.reduce((s, c) => s + c.rfm.monto, 0);
      const pesos = `$${Math.round(total).toLocaleString("es-CO")}`;

      emitir({
        tipo: "herramienta_ok",
        nombre: "calcular_plata_en_riesgo",
        detalle: `${validos.length} clientes · ${pesos}`,
      });

      const invalidos = clienteIds.length - validos.length;
      return [
        `Clientes válidos: ${validos.length}${invalidos ? ` (${invalidos} IDs no existen)` : ""}`,
        `Histórico total del grupo: ${pesos}`,
        `Promedio por cliente: $${validos.length ? Math.round(total / validos.length).toLocaleString("es-CO") : 0}`,
      ].join("\n");
    },
  });

  const whatsapp = betaTool({
    name: "enviar_whatsapp",
    description:
      "Envía un mensaje de WhatsApp a un cliente concreto de la base, identificado por su id. El mensaje debe ir ya personalizado con su nombre real y citar su situación. Máximo 2 envíos por sesión.",
    inputSchema: {
      type: "object",
      properties: {
        clienteId: { type: "string", description: "El id exacto del cliente, visto con ver_clientes." },
        mensaje: { type: "string", description: "El texto final del mensaje, listo para llegar al celular." },
      },
      required: ["clienteId", "mensaje"],
      additionalProperties: false,
    },
    run: async ({ clienteId, mensaje }) => {
      const cliente = porId.get(clienteId);
      if (!cliente) return `Error: no existe ningún cliente con id "${clienteId}".`;
      if (!mensaje.trim()) return "Error: el mensaje está vacío.";

      const nombre = cliente.nombre ?? clienteId;
      emitir({ tipo: "herramienta", nombre: "enviar_whatsapp", detalle: `a ${nombre}` });

      /*
       * EL GUARDARRAÍL. El celular del cliente no se usa jamás: si hay número
       * de prueba y queda cupo, el mensaje sale de verdad hacia ese número (el
       * móvil del escenario); si no, se simula. El agente decide el QUIÉN y el
       * QUÉ; el destino físico lo decide esta función, siempre.
       */
      const numeroPrueba = normalizarCelular(process.env.TWILIO_WHATSAPP_TEST ?? "");

      if (numeroPrueba && enviosReales < MAX_ENVIOS_REALES) {
        const res = await enviarWhatsapp(numeroPrueba, mensaje);

        if (res.ok) {
          enviosReales += 1;
          emitir({
            tipo: "whatsapp",
            cliente: nombre,
            estado: "enviado",
            detalle: "salió de verdad, redirigido al número de prueba",
          });
          return `Mensaje entregado a ${nombre}.`;
        }

        emitir({
          tipo: "whatsapp",
          cliente: nombre,
          estado: "fallo",
          detalle: res.motivo,
        });
        return `No se pudo entregar el mensaje a ${nombre} (${res.motivo}). Sigue con el plan; no reintentes.`;
      }

      emitir({
        tipo: "whatsapp",
        cliente: nombre,
        estado: "simulado",
        detalle:
          enviosReales >= MAX_ENVIOS_REALES
            ? "tope de envíos reales alcanzado"
            : "sin número de prueba configurado",
      });
      return `Mensaje registrado para ${nombre}.`;
    },
  });

  const entregarPlan = betaTool({
    name: "entregar_plan",
    description:
      "Registra el plan comercial definitivo de la semana. Llámala una sola vez, al final, con el plan completo. Cada segmento debe llevar los clienteIds exactos de clientes que hayas visto con ver_clientes: un segmento sin IDs se descarta.",
    inputSchema: ESQUEMA_ENTREGA,
    run: (entrega) => {
      emitir({ tipo: "herramienta", nombre: "entregar_plan", detalle: `${entrega.segmentos.length} segmentos` });

      /*
       * El esquema garantiza la forma; esto garantiza que los IDs existen.
       *
       * Lo que se descarta se anota en el registro del servidor y no en la
       * pantalla: es higiene de este guardarraíl, no algo que le haya salido
       * mal a quien está mirando. El segmento simplemente no aparece, que es
       * exactamente lo que tiene que pasar.
       */
      const segmentos = entrega.segmentos
        .map((s) => {
          const validos = s.clienteIds.filter((id) => porId.has(id));
          if (validos.length !== s.clienteIds.length) {
            console.warn(
              `entregar_plan: ${s.clienteIds.length - validos.length} IDs inexistentes en "${s.nombre}".`,
            );
          } else if (s.clienteIds.length === 0) {
            console.warn(`entregar_plan: el segmento "${s.nombre}" llegó sin clientes.`);
          }
          return { ...s, clienteIds: validos };
        })
        .filter((s) => s.clienteIds.length > 0);

      plan = { analisis: [...frases], resumen: entrega.resumen, segmentos };
      emitir({ tipo: "herramienta_ok", nombre: "entregar_plan", detalle: `${segmentos.length} segmentos válidos` });
      emitir({ tipo: "plan", plan });
      return "Plan registrado. Termina tu turno.";
    },
  });

  const runner = client.beta.messages.toolRunner({
    model: MODELO,
    max_tokens: 32000,
    system: SISTEMA,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: ESFUERZO },
    tools: [verClientes, calcularPlata, whatsapp, entregarPlan],
    messages: [{ role: "user", content: contexto(clientes, negocio) }],
    max_iterations: 10,
    stream: true,
  });

  /*
   * El texto del agente entre herramientas ES el razonamiento visible. Se corta
   * por frases para que la pantalla escriba a ritmo de pensamiento, no a ritmo
   * de token ni en un bloque final.
   */
  let buffer = "";
  const soltarFrases = (final = false) => {
    let corte: number;
    while ((corte = buffer.search(/[.!?…]\s/)) !== -1) {
      const frase = buffer.slice(0, corte + 1).trim();
      buffer = buffer.slice(corte + 2);
      if (frase) decir(frase);
    }
    if (final && buffer.trim()) {
      decir(buffer.trim());
      buffer = "";
    }
  };

  let recordatorios = 0;

  for await (const mensajeStream of runner) {
    for await (const evento of mensajeStream) {
      if (evento.type !== "content_block_delta") continue;
      /*
       * Solo el texto del agente, no los resúmenes de thinking: estos suelen
       * llegar en inglés y en la pantalla de una pyme bogotana desentonan.
       * Y tras entregar el plan, silencio: la pantalla ya está mostrando el
       * resultado y cualquier coletilla del modelo solo le quita foco.
       */
      if (evento.delta.type === "text_delta" && !plan) {
        buffer += evento.delta.text;
        soltarFrases();
      }
    }

    if (!plan) soltarFrases(true);

    const mensaje = await mensajeStream.finalMessage();

    // Turno de servidor pausado: se reanuda reenviando el turno tal cual.
    if (mensaje.stop_reason === "pause_turn") {
      runner.pushMessages({ role: "assistant", content: mensaje.content });
      continue;
    }

    // Se despidió sin entregar el plan: un empujón y sigue. Dos como máximo;
    // a la tercera preferimos fallar claro que colgar la demo.
    if (mensaje.stop_reason === "end_turn" && !plan && recordatorios < 2) {
      recordatorios += 1;
      runner.pushMessages({
        role: "user",
        content: "Falta registrar el plan. Llama a entregar_plan ahora con el plan completo.",
      });
    }
  }

  if (!plan) {
    throw new Error("El agente terminó sin entregar un plan.");
  }

  return { plan, razonamiento: frases.join(" ") };
}

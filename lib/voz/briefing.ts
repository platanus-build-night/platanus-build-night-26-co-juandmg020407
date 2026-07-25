/**
 * El briefing hablado: lo que Chispy le dice al dueño en treinta segundos.
 *
 * No es un resumen de la pantalla ni el razonamiento del agente leído en voz
 * alta. Es lo que un empleado de confianza le diría al dueño al terminar de
 * revisar la base: cuántos hay que contactar, por dónde empezar, cuánta plata
 * hay en juego, qué se hizo ya y qué toca hacer ahora.
 *
 * Se construye aquí, con una plantilla determinista sobre el plan que el agente
 * YA entregó. No hay una segunda llamada al modelo solo para redactar el audio:
 * sería pagar dos veces por la misma conclusión y abriría la puerta a que la voz
 * dijera algo distinto de lo que muestra la pantalla.
 */

import type { ClienteEnriquecido, PlanComercial } from "../tipos.ts";

/**
 * Tope duro de caracteres del texto que se manda a sintetizar.
 *
 * El español hablado a ritmo natural va sobre 15 caracteres por segundo, así que
 * 600 son unos 40 segundos: el techo de lo que alguien escucha de pie delante de
 * una pantalla. También es el techo de gasto — en ElevenLabs se paga por
 * carácter, y este número es lo que impide que una base rara dispare la factura.
 */
export const MAX_CARACTERES_BRIEFING = 600;

export type DatosBriefing = {
  negocio: string;
  clientes: ClienteEnriquecido[];
  plan: PlanComercial;
  /** Mensajes que salieron de verdad por Twilio (al número de prueba). */
  enviosReales: number;
  /** Mensajes que el agente decidió pero no se enviaron físicamente. */
  enviosSimulados: number;
};

/**
 * Plata en palabras, no en dígitos.
 *
 * "$2.340.000" un sintetizador lo lee dígito a dígito o se inventa la cadencia.
 * "2,3 millones de pesos" se lee como lo diría una persona, y para un briefing
 * hablado el orden de magnitud es justo lo que hace falta: nadie retiene las
 * unidades de una cifra que escuchó una vez.
 */
function plataHablada(monto: number): string {
  const n = Math.round(monto);

  if (n >= 1_000_000) {
    const millones = n / 1_000_000;
    // Un decimal hasta diez millones; por encima ya no aporta nada al oído.
    const cifra =
      millones >= 10
        ? String(Math.round(millones))
        : millones.toFixed(1).replace(/[.,]0$/, "").replace(".", ",");
    return `${cifra} ${cifra === "1" ? "millón" : "millones"} de pesos`;
  }

  if (n >= 1_000) return `${Math.round(n / 1_000)} mil pesos`;
  return `${n} pesos`;
}

/**
 * Las cifras abreviadas del agente, dichas como se dicen.
 *
 * `plataHablada()` solo alcanza a las cifras que calculamos aquí. El plan trae
 * además textos libres —"10 clientes en riesgo con $93.8M de histórico"— y ese
 * "$93.8M" el sintetizador lo lee "noventa y tres punto ocho eme".
 *
 * Se traduce antes de recortar, no después: así el tope de caracteres cuenta lo
 * que de verdad se va a oír, y el recorte no puede partir una cifra por la
 * mitad.
 */
function hablarCifras(texto: string): string {
  return texto.replace(
    /\$\s?(\d+(?:[.,]\d+)?)\s?([MmKk])(?![a-zA-ZÀ-ÿ])/g,
    (todo, cifra: string, escala: string) => {
      const base = Number(cifra.replace(",", "."));
      if (!Number.isFinite(base)) return todo;
      return plataHablada(base * (/[Mm]/.test(escala) ? 1_000_000 : 1_000));
    },
  );
}

/**
 * Deja el fragmento presentable para el oído: sin puntuación colgando y sin
 * incisos a medias.
 *
 * Un paréntesis que el recorte dejó abierto se oye como una frase rota. En
 * producción salió tal cual: "priorizando primero a los de mayor monto
 * histórico (Camila, Felipe, por whatsapp". Cortar el inciso entero pierde un
 * par de nombres; dejarlo a medias pierde la frase.
 */
function pulir(fragmento: string): string {
  let texto = fragmento;

  while (
    (texto.match(/\(/g) ?? []).length > (texto.match(/\)/g) ?? []).length
  ) {
    texto = texto.slice(0, texto.lastIndexOf("("));
  }

  return texto.replace(/[.;,\s]+$/, "").trim();
}

/** Corta en el último espacio para no partir palabras, y limpia la puntuación. */
function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return pulir(limpio);

  const corte = limpio.slice(0, max);
  const espacio = corte.lastIndexOf(" ");
  return pulir(espacio > max * 0.6 ? corte.slice(0, espacio) : corte);
}

/** Une un texto libre del agente al guion sin heredar su puntuación final. */
function frase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return /[.!?…]$/.test(limpio) ? limpio : `${limpio}.`;
}

/**
 * Construye el guion.
 *
 * Cada línea lleva un `descarte`: si el guion no cabe en el tope, se van
 * quitando las de número más alto hasta que quepa. Así el recorte nunca se come
 * la cifra ni la acción recomendada — se come el color.
 */
export function construirBriefing(datos: DatosBriefing): string {
  const { negocio, clientes, plan, enviosReales, enviosSimulados } = datos;

  const porId = new Map(clientes.map((c) => [c.id, c]));

  // Un cliente puede aparecer en dos segmentos; al dueño le importa a cuántas
  // personas distintas hay que escribirle, no cuántas casillas se llenaron.
  const aContactar = new Set(plan.segmentos.flatMap((s) => s.clienteIds));
  const plataDelPlan = [...aContactar].reduce(
    (suma, id) => suma + (porId.get(id)?.rfm.monto ?? 0),
    0,
  );

  const prioritario = plan.segmentos[0];
  const lineas: { texto: string; descarte: number }[] = [];

  lineas.push({
    texto: `Revisé los ${clientes.length} clientes de ${negocio}.`,
    descarte: 3,
  });

  if (aContactar.size > 0) {
    const cuantos =
      aContactar.size === 1 ? "un cliente" : `${aContactar.size} clientes`;
    lineas.push({
      texto: `Esta semana conviene contactar a ${cuantos}, que suman ${plataHablada(plataDelPlan)} de compras registradas.`,
      descarte: 0,
    });
  }

  if (prioritario) {
    lineas.push({
      texto: `La prioridad es el grupo ${recortar(hablarCifras(prioritario.nombre), 60)}: ${frase(recortar(hablarCifras(prioritario.descripcion), 130))}`,
      descarte: 2,
    });
    lineas.push({
      texto: `La acción recomendada es ${recortar(hablarCifras(prioritario.oferta), 150)}, por ${prioritario.canal}.`,
      descarte: 0,
    });
  }

  if (enviosReales > 0) {
    // El verbo concuerda: en voz alta, "ya salió 2 mensajes" chirría.
    const cuantos =
      enviosReales === 1 ? "Ya salió un mensaje" : `Ya salieron ${enviosReales} mensajes`;
    lineas.push({
      texto: `${cuantos} de verdad por WhatsApp, al número de prueba.`,
      descarte: 1,
    });
  } else if (enviosSimulados > 0) {
    lineas.push({
      texto: "Los envíos quedaron simulados: ningún cliente recibió nada todavía.",
      descarte: 1,
    });
  }

  lineas.push({
    texto: prioritario
      ? "Tu siguiente paso es revisar ese mensaje en pantalla y darle enviar."
      : "Revisa el plan en pantalla antes de escribirle a nadie.",
    descarte: 0,
  });

  // Se descartan las líneas de color, de menos importante a más, hasta caber.
  const vivas = lineas.map((l) => ({ ...l, viva: true }));
  const largo = () =>
    vivas.filter((l) => l.viva).map((l) => l.texto).join(" ").length;

  for (const nivel of [3, 2, 1]) {
    if (largo() <= MAX_CARACTERES_BRIEFING) break;
    for (const linea of vivas) if (linea.descarte === nivel) linea.viva = false;
  }

  const guion = vivas
    .filter((l) => l.viva)
    .map((l) => l.texto)
    .join(" ");

  // Red de seguridad: ni con todo descartado puede pasarse del tope, porque los
  // textos del agente son libres y podrían venir enormes.
  return guion.length <= MAX_CARACTERES_BRIEFING
    ? guion
    : `${recortar(guion, MAX_CARACTERES_BRIEFING - 1)}.`;
}

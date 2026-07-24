/**
 * RFM: recencia, frecuencia, monto.
 *
 * Este es el dato que la pyme YA TIENE y no está usando. No requiere ninguna
 * fuente externa ni autorización de nadie: son sus propias ventas. Por eso es
 * la base más sólida del enriquecimiento y la que nunca falla.
 *
 * Los umbrales son deliberadamente explícitos y explicables: cada cliente sale
 * con una `razon` en castellano llano. Si el jurado pregunta "¿por qué este
 * cliente es 'en riesgo'?", la respuesta está en el propio dato, no en el modelo.
 */

import type { Cliente, Rfm, SegmentoRfm } from "../tipos.ts";

/** Umbrales en días. Ajustables sin tocar la lógica. */
const RECIENTE = 90;
const TIBIO = 180;
const FRIO = 365;

/** Compras a partir de las cuales consideramos que hay hábito. */
const FRECUENTE = 4;
const REPETIDOR = 2;

function diasDesde(fecha: string | null, hoy: Date): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((hoy.getTime() - d.getTime()) / 86_400_000);
}

export function calcularRfm(cliente: Cliente, hoy: Date = new Date()): Rfm {
  const recencia = diasDesde(cliente.ultimaCompra, hoy);
  const frecuencia = cliente.numCompras ?? 0;
  const monto = cliente.montoTotal ?? 0;

  const base = { recenciaDias: recencia, frecuencia, monto };

  if (recencia === null || frecuencia === 0) {
    return {
      ...base,
      segmento: "sin_datos" as SegmentoRfm,
      razon: "no hay historial de compras registrado",
    };
  }

  const meses = Math.round(recencia / 30);

  if (recencia <= RECIENTE && frecuencia >= FRECUENTE) {
    return {
      ...base,
      segmento: "campeon",
      razon: `${frecuencia} compras y la última hace ${recencia} días`,
    };
  }

  if (recencia <= TIBIO && frecuencia >= 3) {
    return {
      ...base,
      segmento: "leal",
      razon: `compra con regularidad (${frecuencia} veces), última hace ${recencia} días`,
    };
  }

  if (recencia <= RECIENTE && frecuencia === 1) {
    return {
      ...base,
      segmento: "nuevo",
      razon: `primera compra hace ${recencia} días, todavía sin repetir`,
    };
  }

  if (recencia <= RECIENTE && frecuencia >= REPETIDOR) {
    return {
      ...base,
      segmento: "potencial",
      razon: `${frecuencia} compras recientes, va camino de volverse habitual`,
    };
  }

  // Los que más duele perder: tenían hábito y llevan meses sin aparecer.
  if (frecuencia >= 3 && recencia <= FRIO) {
    return {
      ...base,
      segmento: "en_riesgo",
      razon: `era cliente habitual (${frecuencia} compras) pero lleva ${meses} meses sin comprar`,
    };
  }

  if (recencia <= FRIO) {
    return {
      ...base,
      segmento: "dormido",
      razon: `sin comprar hace ${meses} meses`,
    };
  }

  return {
    ...base,
    segmento: "perdido",
    razon: `última compra hace más de un año (${meses} meses)`,
  };
}

/** Etiquetas para la UI. */
export const ETIQUETAS_RFM: Record<SegmentoRfm, string> = {
  campeon: "Campeón",
  leal: "Leal",
  potencial: "Potencial",
  nuevo: "Nuevo",
  en_riesgo: "En riesgo",
  dormido: "Dormido",
  perdido: "Perdido",
  sin_datos: "Sin datos",
};

/** Orden de prioridad comercial: a quién conviene hablarle antes. */
export const PRIORIDAD_RFM: SegmentoRfm[] = [
  "en_riesgo",
  "campeon",
  "leal",
  "potencial",
  "dormido",
  "nuevo",
  "perdido",
  "sin_datos",
];

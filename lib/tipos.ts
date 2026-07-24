/** Tipos compartidos. Espejo de supabase/schema.sql. */

import type { ZonaResuelta } from "./data/bogota.ts";

/** Una fila del CSV, ya mapeada a campos conocidos. */
export type Cliente = {
  id: string;
  nombre: string | null;
  correo: string | null;
  celular: string | null;
  direccion: string | null;
  barrioRaw: string | null;
  nit: string | null;
  esEmpresa: boolean;

  primeraCompra: string | null;
  ultimaCompra: string | null;
  numCompras: number;
  montoTotal: number;

  datosCrudos: Record<string, string>;
};

export type SegmentoRfm =
  | "campeon"
  | "leal"
  | "potencial"
  | "nuevo"
  | "en_riesgo"
  | "dormido"
  | "perdido"
  | "sin_datos";

export type Rfm = {
  recenciaDias: number | null;
  frecuencia: number;
  monto: number;
  segmento: SegmentoRfm;
  /** Explicación en una línea de por qué cayó en ese segmento. */
  razon: string;
};

/**
 * Una fuente que aportó un dato concreto. Va a la columna `fuentes`.
 * Es lo que permite decir "todo dato es trazable" en lugar de pedir fe.
 */
export type Fuente = {
  campo: string;
  origen: string;
  confianza: "exacta" | "probable" | "derivada" | "fallida";
};

export type ClienteEnriquecido = Cliente & {
  zona: ZonaResuelta;
  rfm: Rfm;
  fuentes: Fuente[];
};

/** Lo que el agente decide. */
export type Segmento = {
  nombre: string;
  descripcion: string;
  clienteIds: string[];
  oferta: string;
  canal: string;
  /** Plantilla con {{nombre}} para personalizar por cliente. */
  mensaje: string;
  /** Por qué este segmento merece esta oferta. Se muestra en la UI. */
  justificacion: string;
};

export type PlanComercial = {
  /**
   * El razonamiento del agente, paso a paso.
   *
   * Va primero en el esquema a propósito: el modelo genera el JSON en orden, así
   * que estas frases llegan antes que nada y se pintan en vivo mientras el resto
   * del plan se sigue escribiendo.
   */
  analisis: string[];
  resumen: string;
  segmentos: Segmento[];
};

/** Eventos del stream que alimenta la UI en cascada. */
export type EventoChispy =
  | { tipo: "inicio"; totalClientes: number }
  | { tipo: "cliente"; cliente: ClienteEnriquecido; indice: number }
  | { tipo: "fase"; nombre: string; detalle?: string }
  | { tipo: "razonamiento"; texto: string }
  | { tipo: "plan"; plan: PlanComercial }
  | { tipo: "error"; mensaje: string }
  | { tipo: "fin" };

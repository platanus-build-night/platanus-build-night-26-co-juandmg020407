/**
 * Ingesta de CSV del mundo real.
 *
 * Los CSV de una pyme colombiana no son limpios: vienen de Excel en español, con
 * punto y coma de separador, BOM al principio, fechas DD/MM/YYYY, montos con
 * punto como separador de miles ("4.850.000") y encabezados sin tildes ni criterio.
 *
 * Un parser ingenuo lee "4.850.000" como 4,85 y arruina todo el análisis en
 * silencio. Por eso el parseo de números y fechas es explícito aquí.
 */

import Papa from "papaparse";
import type { Cliente } from "../tipos.ts";
import { normalizarTexto } from "../data/bogota.ts";

/** Patrones de encabezado → campo. El primero que casa, gana. */
const PATRONES: Array<[keyof Cliente | "ignorar", RegExp]> = [
  ["correo", /correo|email|e mail|mail/],
  ["celular", /celular|whatsapp|movil|telefono|tel|cel/],
  ["nit", /\bnit\b|razon social/],
  ["barrioRaw", /barrio|localidad|zona|sector/],
  ["direccion", /direccion|domicilio|ubicacion/],
  ["primeraCompra", /primera compra|primera|fecha alta|alta|ingreso/],
  ["ultimaCompra", /ultima compra|ultima|fecha ultima|reciente/],
  ["numCompras", /num.*compra|no.*compra|cantidad.*compra|compras|pedidos|transacciones|frecuencia/],
  ["montoTotal", /total|monto|valor|ventas|facturado|gastado/],
  ["nombre", /nombre|cliente|contacto/],
];

export type MapeoColumnas = Partial<Record<keyof Cliente, string>>;

/** Adivina qué columna del CSV corresponde a cada campo conocido. */
export function detectarColumnas(encabezados: string[]): MapeoColumnas {
  const mapeo: MapeoColumnas = {};
  const usados = new Set<string>();

  for (const [campo, patron] of PATRONES) {
    if (campo === "ignorar") continue;
    for (const encabezado of encabezados) {
      if (usados.has(encabezado)) continue;
      if (patron.test(normalizarTexto(encabezado))) {
        mapeo[campo as keyof Cliente] = encabezado;
        usados.add(encabezado);
        break;
      }
    }
  }

  return mapeo;
}

/**
 * Parsea un número en formato colombiano.
 *
 * "4.850.000"    -> 4850000   (punto = miles)
 * "1.250.000,50" -> 1250000.5 (coma = decimal)
 * "$ 890.000"    -> 890000
 * "3,5"          -> 3.5       (coma decimal sin miles)
 */
export function parsearNumero(valor: string | null | undefined): number {
  if (!valor) return 0;

  const limpio = valor.replace(/[^\d.,-]/g, "").trim();
  if (!limpio) return 0;

  const tienePunto = limpio.includes(".");
  const tieneComa = limpio.includes(",");

  let normalizado: string;

  if (tienePunto && tieneComa) {
    // El último separador que aparece es el decimal.
    normalizado =
      limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
        ? limpio.replace(/\./g, "").replace(",", ".")
        : limpio.replace(/,/g, "");
  } else if (tieneComa) {
    const partes = limpio.split(",");
    // "1,234" con 3 dígitos detrás es separador de miles; "3,5" es decimal.
    normalizado =
      partes.length === 2 && partes[1].length === 3
        ? limpio.replace(",", "")
        : limpio.replace(",", ".");
  } else if (tienePunto) {
    const partes = limpio.split(".");
    // Varios puntos, o uno con exactamente 3 dígitos detrás: separador de miles.
    const esMiles =
      partes.length > 2 || (partes.length === 2 && partes[1].length === 3);
    normalizado = esMiles ? limpio.replace(/\./g, "") : limpio;
  } else {
    normalizado = limpio;
  }

  const n = Number.parseFloat(normalizado);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parsea fechas en los formatos que llegan de verdad.
 * Asume día-primero, que es lo colombiano, salvo que sea inequívocamente ISO.
 */
export function parsearFecha(valor: string | null | undefined): string | null {
  if (!valor?.trim()) return null;
  const texto = valor.trim();

  // ISO: 2026-07-24
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, a, m, d] = iso;
    return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const latino = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (latino) {
    const [, d, m, aRaw] = latino;
    const dia = Number(d);
    const mes = Number(m);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const a = aRaw.length === 2 ? `20${aRaw}` : aRaw;
    return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Normaliza un celular colombiano a E.164 (+57XXXXXXXXXX), que es lo que
 * Twilio necesita. Devuelve null si no parece un móvil colombiano válido.
 */
export function normalizarCelular(valor: string | null | undefined): string | null {
  if (!valor) return null;

  let d = valor.replace(/\D/g, "");
  if (d.startsWith("57") && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) return `+57${d}`;

  return null;
}

export type ResultadoIngesta = {
  clientes: Cliente[];
  mapeo: MapeoColumnas;
  encabezados: string[];
  /** Problemas no bloqueantes, para mostrar al usuario sin detener nada. */
  avisos: string[];
};

export function parsearCsv(contenido: string): ResultadoIngesta {
  // Excel en español guarda con BOM y a veces con punto y coma.
  const sinBom = contenido.replace(/^﻿/, "");

  const parsed = Papa.parse<Record<string, string>>(sinBom, {
    header: true,
    skipEmptyLines: true,
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  const encabezados = parsed.meta.fields ?? [];
  const mapeo = detectarColumnas(encabezados);
  const avisos: string[] = [];

  if (!mapeo.nombre) avisos.push("No se encontró columna de nombre.");
  if (!mapeo.celular && !mapeo.correo) {
    avisos.push("No hay columna de celular ni de correo: no se podrá contactar a nadie.");
  }
  if (!mapeo.barrioRaw && !mapeo.direccion) {
    avisos.push("Sin barrio ni dirección: no habrá enriquecimiento por zona.");
  }

  const leer = (fila: Record<string, string>, campo: keyof Cliente): string | null => {
    const col = mapeo[campo];
    if (!col) return null;
    const v = fila[col];
    return v?.trim() ? v.trim() : null;
  };

  const clientes: Cliente[] = parsed.data.map((fila, i) => {
    const celularCrudo = leer(fila, "celular");
    const nit = leer(fila, "nit");

    return {
      id: `c${i + 1}`,
      nombre: leer(fila, "nombre"),
      correo: leer(fila, "correo"),
      celular: normalizarCelular(celularCrudo) ?? celularCrudo,
      direccion: leer(fila, "direccion"),
      barrioRaw: leer(fila, "barrioRaw") ?? leer(fila, "direccion"),
      nit,
      esEmpresa: Boolean(nit),
      primeraCompra: parsearFecha(leer(fila, "primeraCompra")),
      ultimaCompra: parsearFecha(leer(fila, "ultimaCompra")),
      numCompras: Math.round(parsearNumero(leer(fila, "numCompras"))),
      montoTotal: parsearNumero(leer(fila, "montoTotal")),
      datosCrudos: fila,
    };
  });

  const sinContacto = clientes.filter((c) => !c.celular && !c.correo).length;
  if (sinContacto > 0) {
    avisos.push(`${sinContacto} clientes sin ningún dato de contacto.`);
  }

  return { clientes, mapeo, encabezados, avisos };
}

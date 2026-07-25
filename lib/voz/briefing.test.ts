/**
 * Pruebas del guion hablado.
 *
 * Ninguna llama a ElevenLabs: `construirBriefing` es una plantilla determinista
 * y esa es justamente la razón de que lo sea. Aquí se verifica lo que cuesta
 * dinero o credibilidad — que el texto nunca se pase del tope de caracteres, que
 * las cifras se digan como las diría una persona, y que no prometa envíos que no
 * ocurrieron.
 *
 * Se ejecuta con:  node --test lib/voz/briefing.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CARACTERES_BRIEFING,
  construirBriefing,
  type DatosBriefing,
} from "./briefing.ts";
import type { ClienteEnriquecido, PlanComercial, Segmento } from "../tipos.ts";

function cliente(id: string, monto: number): ClienteEnriquecido {
  return {
    id,
    nombre: `Cliente ${id}`,
    correo: null,
    celular: null,
    direccion: null,
    barrioRaw: null,
    nit: null,
    esEmpresa: false,
    primeraCompra: null,
    ultimaCompra: "2025-01-01",
    numCompras: 4,
    montoTotal: monto,
    datosCrudos: {},
    zona: {
      localidad: "Suba",
      estratoPredominante: 3,
      rangoEstrato: [2, 4],
      ingresoHogarPromedio: 3_000_000,
      poblacionZona: 1_200_000,
      confianza: "probable",
      via: "prueba",
    },
    rfm: {
      recenciaDias: 200,
      frecuencia: 4,
      monto,
      segmento: "en_riesgo",
      razon: "prueba",
    },
    fuentes: [],
  };
}

function segmento(parcial: Partial<Segmento> = {}): Segmento {
  return {
    nombre: "Se nos están yendo los buenos",
    descripcion: "compraban cada mes y llevan medio año sin aparecer",
    clienteIds: ["c1", "c2"],
    oferta: "20% en baño y peluquería antes del viernes",
    canal: "whatsapp",
    mensaje: "Hola {{nombre}}, te extrañamos.",
    justificacion: "prueba",
    ...parcial,
  };
}

function datos(parcial: Partial<DatosBriefing> = {}): DatosBriefing {
  const plan: PlanComercial = {
    analisis: [],
    resumen: "prueba",
    segmentos: [segmento()],
  };

  return {
    negocio: "Veterinaria Huellitas",
    clientes: [cliente("c1", 1_200_000), cliente("c2", 1_100_000), cliente("c3", 50_000)],
    plan,
    enviosReales: 1,
    enviosSimulados: 0,
    ...parcial,
  };
}

test("nombra el negocio, cuenta la base y cuantifica a quién contactar", () => {
  const texto = construirBriefing(datos());

  assert.match(texto, /3 clientes de Veterinaria Huellitas/);
  assert.match(texto, /contactar a 2 clientes/);
  // 1.200.000 + 1.100.000 = 2,3 millones. c3 no está en el plan y no debe sumar.
  assert.match(texto, /2,3 millones de pesos/);
});

test("dice la acción recomendada y el canal del segmento prioritario", () => {
  const texto = construirBriefing(datos());

  assert.match(texto, /Se nos están yendo los buenos/);
  assert.match(texto, /20% en baño y peluquería/);
  assert.match(texto, /por whatsapp/);
});

test("no promete envíos reales cuando todo quedó simulado", () => {
  const texto = construirBriefing(datos({ enviosReales: 0, enviosSimulados: 2 }));

  assert.match(texto, /simulados/);
  assert.doesNotMatch(texto, /de verdad/);
});

test("avisa del envío real cuando salió de verdad", () => {
  const texto = construirBriefing(datos({ enviosReales: 1, enviosSimulados: 1 }));

  assert.match(texto, /un mensaje de verdad/);
});

test("cuenta a cada cliente una sola vez aunque esté en dos segmentos", () => {
  const plan: PlanComercial = {
    analisis: [],
    resumen: "prueba",
    segmentos: [segmento(), segmento({ nombre: "Otro", clienteIds: ["c1", "c3"] })],
  };

  const texto = construirBriefing(datos({ plan }));

  assert.match(texto, /contactar a 3 clientes/);
});

test("nunca se pasa del tope, ni con textos disparatados del agente", () => {
  const plan: PlanComercial = {
    analisis: [],
    resumen: "x".repeat(4000),
    segmentos: [
      segmento({
        nombre: "n".repeat(500),
        descripcion: "d".repeat(3000),
        oferta: "o".repeat(3000),
      }),
    ],
  };

  const texto = construirBriefing(datos({ plan, negocio: "N".repeat(300) }));

  assert.ok(
    texto.length <= MAX_CARACTERES_BRIEFING,
    `el guion mide ${texto.length} caracteres`,
  );
});

test("sobrevive a un plan vacío sin inventarse nada", () => {
  const plan: PlanComercial = { analisis: [], resumen: "", segmentos: [] };
  const texto = construirBriefing(datos({ plan, enviosReales: 0, enviosSimulados: 0 }));

  assert.ok(texto.length > 0);
  assert.ok(texto.length <= MAX_CARACTERES_BRIEFING);
  assert.doesNotMatch(texto, /NaN|undefined|null/);
});

test("habla las cifras en vez de deletrear dígitos", () => {
  const chico = construirBriefing(
    datos({ clientes: [cliente("c1", 400_000), cliente("c2", 450_000)] }),
  );
  assert.match(chico, /850 mil pesos/);

  const grande = construirBriefing(
    datos({ clientes: [cliente("c1", 30_000_000), cliente("c2", 12_000_000)] }),
  );
  assert.match(grande, /42 millones de pesos/);

  const justo = construirBriefing(
    datos({ clientes: [cliente("c1", 500_000), cliente("c2", 500_000)] }),
  );
  assert.match(justo, /1 millón de pesos/);
});

test("no deja doble puntuación al pegar los textos del agente", () => {
  const plan: PlanComercial = {
    analisis: [],
    resumen: "prueba",
    segmentos: [segmento({ descripcion: "llevan medio año sin aparecer." })],
  };

  const texto = construirBriefing(datos({ plan }));

  assert.doesNotMatch(texto, /\.\./);
});

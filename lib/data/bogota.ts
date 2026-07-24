/**
 * Datos semilla de Bogotá para el enriquecimiento por zona.
 *
 * POR QUÉ ESTÁ EN EL REPO Y NO SE CONSULTA POR RED:
 * son ~150 filas que no cambian. Pedirlas a un portal público durante la demo
 * solo añade una forma de fallar en directo. Cero llamadas, cero riesgo.
 *
 * NATURALEZA DEL DATO (importante para el pitch y para la Ley 1581):
 * el estrato se asigna al INMUEBLE, no a la persona (Ley 142 de 1994). Usado
 * agregado por zona no constituye tratamiento de dato personal. Nunca guardamos
 * ni inferimos un estrato "de alguien": lo que decimos es "el estrato predominante
 * de esta zona es X".
 *
 * PRECISIÓN: `estratoPredominante` es la moda de la localidad, no el estrato de
 * una dirección concreta. Localidades como Suba o Usaquén son muy heterogéneas —
 * por eso cada una lleva su `rango` y la confianza se reporta siempre.
 * Validar contra el dataset oficial antes de presumir de exactitud:
 * https://datosabiertos.bogota.gov.co/dataset/estrato-socioeconomico-bogota-d-c
 */

export type Localidad = {
  nombre: string;
  estratoPredominante: number;
  rango: [number, number];
  poblacion: number;
  /** Variantes con las que la gente realmente escribe la localidad. */
  alias: string[];
};

export const LOCALIDADES: Localidad[] = [
  { nombre: "Usaquén",           estratoPredominante: 4, rango: [1, 6], poblacion: 590000,  alias: ["usaquen"] },
  { nombre: "Chapinero",         estratoPredominante: 4, rango: [2, 6], poblacion: 140000,  alias: ["chapi"] },
  { nombre: "Santa Fe",          estratoPredominante: 2, rango: [1, 4], poblacion: 110000,  alias: ["santafe", "santa fé"] },
  { nombre: "San Cristóbal",     estratoPredominante: 2, rango: [1, 3], poblacion: 400000,  alias: ["san cristobal"] },
  { nombre: "Usme",              estratoPredominante: 1, rango: [1, 2], poblacion: 340000,  alias: [] },
  { nombre: "Tunjuelito",        estratoPredominante: 2, rango: [1, 3], poblacion: 200000,  alias: [] },
  { nombre: "Bosa",              estratoPredominante: 2, rango: [1, 3], poblacion: 750000,  alias: [] },
  { nombre: "Kennedy",           estratoPredominante: 3, rango: [1, 4], poblacion: 1200000, alias: ["kenedy"] },
  { nombre: "Fontibón",          estratoPredominante: 3, rango: [2, 4], poblacion: 400000,  alias: ["fontibon"] },
  { nombre: "Engativá",          estratoPredominante: 3, rango: [2, 4], poblacion: 880000,  alias: ["engativa"] },
  { nombre: "Suba",              estratoPredominante: 3, rango: [1, 5], poblacion: 1300000, alias: [] },
  { nombre: "Barrios Unidos",    estratoPredominante: 3, rango: [2, 4], poblacion: 270000,  alias: ["barrios"] },
  { nombre: "Teusaquillo",       estratoPredominante: 4, rango: [3, 5], poblacion: 150000,  alias: [] },
  { nombre: "Los Mártires",      estratoPredominante: 3, rango: [1, 3], poblacion: 99000,   alias: ["los martires", "martires"] },
  { nombre: "Antonio Nariño",    estratoPredominante: 3, rango: [2, 4], poblacion: 110000,  alias: ["antonio narino"] },
  { nombre: "Puente Aranda",     estratoPredominante: 3, rango: [2, 4], poblacion: 250000,  alias: [] },
  { nombre: "La Candelaria",     estratoPredominante: 2, rango: [1, 3], poblacion: 22000,   alias: ["candelaria", "centro historico"] },
  { nombre: "Rafael Uribe Uribe",estratoPredominante: 2, rango: [1, 3], poblacion: 370000,  alias: ["rafael uribe"] },
  { nombre: "Ciudad Bolívar",    estratoPredominante: 1, rango: [1, 3], poblacion: 750000,  alias: ["ciudad bolivar", "cdad bolivar"] },
  { nombre: "Sumapaz",           estratoPredominante: 1, rango: [1, 2], poblacion: 7000,    alias: [] },
];

/**
 * Barrio → localidad. La gente da el barrio, casi nunca la localidad.
 * Tabla parcial con los barrios más nombrados; ampliable desde el dataset oficial.
 */
export const BARRIOS: Record<string, string> = {
  // Usaquén
  "cedritos": "Usaquén", "santa barbara": "Usaquén", "country club": "Usaquén",
  "toberin": "Usaquén", "la carolina": "Usaquén", "unicentro": "Usaquén",
  "san cristobal norte": "Usaquén", "usaquen centro": "Usaquén",
  // Chapinero
  "zona t": "Chapinero", "zona g": "Chapinero", "chico": "Chapinero",
  "rosales": "Chapinero", "quinta camacho": "Chapinero", "chapinero alto": "Chapinero",
  "lourdes": "Chapinero", "el nogal": "Chapinero",
  // Suba
  "niza": "Suba", "colina campestre": "Suba", "el rincon": "Suba",
  "tibabuyes": "Suba", "prado veraniego": "Suba", "mazuren": "Suba",
  "suba centro": "Suba", "la campina": "Suba",
  // Engativá
  "normandia": "Engativá", "alamos": "Engativá", "villa luz": "Engativá",
  "boyaca real": "Engativá", "bosque popular": "Engativá", "florencia": "Engativá",
  // Fontibón
  "modelia": "Fontibón", "hayuelos": "Fontibón", "capellania": "Fontibón",
  "fontibon centro": "Fontibón",
  // Kennedy
  "castilla": "Kennedy", "timiza": "Kennedy", "patio bonito": "Kennedy",
  "marsella": "Kennedy", "las americas": "Kennedy", "kennedy central": "Kennedy",
  // Teusaquillo
  "galerias": "Teusaquillo", "palermo": "Teusaquillo", "la soledad": "Teusaquillo",
  "nicolas de federman": "Teusaquillo", "ciudad salitre": "Teusaquillo",
  // Barrios Unidos
  "doce de octubre": "Barrios Unidos", "alcazares": "Barrios Unidos",
  "siete de agosto": "Barrios Unidos", "12 de octubre": "Barrios Unidos",
  // Puente Aranda
  "ciudad montes": "Puente Aranda", "galan": "Puente Aranda",
  // Santa Fe / Candelaria
  "la macarena": "Santa Fe", "las nieves": "Santa Fe", "egipto": "La Candelaria",
  // Sur
  "el ensueno": "Ciudad Bolívar", "lucero": "Ciudad Bolívar", "ismael perdomo": "Ciudad Bolívar",
  "bosa centro": "Bosa", "el recreo": "Bosa", "el porvenir": "Bosa",
  "gran yomasa": "Usme", "comuneros": "Usme",
  "veinte de julio": "San Cristóbal", "20 de julio": "San Cristóbal", "la victoria": "San Cristóbal",
  "quiroga": "Rafael Uribe Uribe", "marruecos": "Rafael Uribe Uribe",
  "restrepo": "Antonio Nariño", "santander": "Antonio Nariño",
  "ricaurte": "Los Mártires", "santa isabel": "Los Mártires", "paloquemao": "Los Mártires",
  "venecia": "Tunjuelito",
};

/**
 * Ingreso mensual aproximado del hogar por estrato, en pesos colombianos.
 *
 * APROXIMACIÓN, no dato oficial. Sirve para ordenar segmentos por capacidad de
 * gasto, no para afirmar cuánto gana nadie. Si el jurado pregunta por la fuente,
 * la respuesta honesta es "orden de magnitud derivado del estrato, no medición".
 */
export const INGRESO_POR_ESTRATO: Record<number, number> = {
  1: 1_400_000,
  2: 2_000_000,
  3: 3_200_000,
  4: 5_500_000,
  5: 9_000_000,
  6: 15_000_000,
};

/** Minúsculas, sin tildes, sin puntuación, espacios colapsados. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de Levenshtein. Para aguantar erratas tipo "engatva" o "chapineo". */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i++) {
    const actual = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const coste = a[i] === b[j] ? 0 : 1;
      actual.push(Math.min(actual[j] + 1, previa[j + 1] + 1, previa[j] + coste));
    }
    previa = actual;
  }

  return previa[b.length];
}

export type ZonaResuelta = {
  localidad: string;
  estratoPredominante: number;
  rangoEstrato: [number, number];
  ingresoHogarPromedio: number;
  poblacionZona: number;
  confianza: "exacta" | "probable" | "fallida";
  /** Qué regla la resolvió. Va a la columna `fuentes` para trazabilidad. */
  via: string;
};

const SIN_RESOLVER: ZonaResuelta = {
  localidad: "",
  estratoPredominante: 0,
  rangoEstrato: [0, 0],
  ingresoHogarPromedio: 0,
  poblacionZona: 0,
  confianza: "fallida",
  via: "sin coincidencia",
};

function construir(
  loc: Localidad,
  confianza: ZonaResuelta["confianza"],
  via: string,
): ZonaResuelta {
  return {
    localidad: loc.nombre,
    estratoPredominante: loc.estratoPredominante,
    rangoEstrato: loc.rango,
    ingresoHogarPromedio: INGRESO_POR_ESTRATO[loc.estratoPredominante] ?? 0,
    poblacionZona: loc.poblacion,
    confianza,
    via,
  };
}

/**
 * Resuelve texto libre ("chapinero alto", "Cra 15 #93-60, Chicó", "suba rincon")
 * a una localidad con su contexto socioeconómico.
 *
 * Estrategia en cascada, de más a menos fiable. Devuelve siempre la confianza
 * para que la UI pueda mostrar cuándo el dato es una conjetura y no un hecho.
 */
export function resolverZona(entrada: string | null | undefined): ZonaResuelta {
  if (!entrada?.trim()) return SIN_RESOLVER;

  const texto = normalizarTexto(entrada);
  if (!texto) return SIN_RESOLVER;

  // 1. Coincidencia exacta de localidad o alias.
  for (const loc of LOCALIDADES) {
    const candidatos = [normalizarTexto(loc.nombre), ...loc.alias.map(normalizarTexto)];
    if (candidatos.includes(texto)) return construir(loc, "exacta", "localidad exacta");
  }

  // 2. Barrio conocido, por coincidencia exacta o contenido en la dirección.
  const barrioExacto = BARRIOS[texto];
  if (barrioExacto) {
    const loc = LOCALIDADES.find((l) => l.nombre === barrioExacto)!;
    return construir(loc, "exacta", `barrio "${texto}"`);
  }
  // El barrio más largo que aparezca en el texto gana: evita que "chico" dispare
  // dentro de "chicó norte" cuando existiera una entrada más específica.
  const barriosOrdenados = Object.keys(BARRIOS).sort((a, b) => b.length - a.length);
  for (const barrio of barriosOrdenados) {
    if (texto.includes(barrio)) {
      const loc = LOCALIDADES.find((l) => l.nombre === BARRIOS[barrio])!;
      return construir(loc, "probable", `barrio "${barrio}" en la dirección`);
    }
  }

  // 3. Nombre de localidad contenido en un texto más largo.
  for (const loc of LOCALIDADES) {
    const candidatos = [normalizarTexto(loc.nombre), ...loc.alias.map(normalizarTexto)];
    for (const c of candidatos) {
      if (c.length >= 4 && texto.includes(c)) {
        return construir(loc, "probable", `localidad "${c}" en el texto`);
      }
    }
  }

  // 4. Erratas: distancia sobre cada palabra suelta.
  const palabras = texto.split(" ").filter((p) => p.length >= 4);
  let mejor: { loc: Localidad; d: number; palabra: string } | null = null;

  for (const palabra of palabras) {
    for (const loc of LOCALIDADES) {
      const candidatos = [normalizarTexto(loc.nombre), ...loc.alias.map(normalizarTexto)];
      for (const c of candidatos) {
        const d = distancia(palabra, c);
        // Tolerancia proporcional: ~25% de la longitud, tope de 3 ediciones.
        const umbral = Math.min(3, Math.floor(c.length * 0.25));
        if (d <= umbral && (!mejor || d < mejor.d)) {
          mejor = { loc, d, palabra };
        }
      }
    }
  }

  if (mejor) {
    return construir(mejor.loc, "probable", `errata: "${mejor.palabra}" ≈ ${mejor.loc.nombre}`);
  }

  return SIN_RESOLVER;
}

"use client";

/**
 * La pantalla.
 *
 * Está diseñada para una sala a oscuras y un proyector, no para un portátil:
 * cifras enormes, contraste alto, y una jerarquía que se lee de un vistazo desde
 * el fondo de la sala.
 *
 * El orden de aparición es deliberado — es el guion de la demo:
 *   1. La base entra en cascada (se ve el trabajo)
 *   2. El agente razona en voz alta (se ve pensar)
 *   3. Aparece la plata en riesgo (el golpe)
 *   4. Salen los mensajes listos para enviar (el cierre)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Ojos, type EstadoOjos } from "@/components/Ojos.tsx";
import { Voz } from "@/components/Voz.tsx";
import { ETIQUETAS_RFM } from "@/lib/enriquecimiento/rfm.ts";
import type {
  ClienteEnriquecido,
  EventoChispy,
  PlanComercial,
  Segmento,
  SegmentoRfm,
} from "@/lib/tipos.ts";

const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

/**
 * El panel del agente ya no es solo texto: intercala lo que dice con lo que
 * HACE. Cada llamada a herramienta y cada envío entran aquí en el orden real
 * en que ocurrieron — eso es lo que distingue ver trabajar a un agente de leer
 * un informe.
 */
type Entrada =
  | { clase: "texto"; texto: string }
  | { clase: "tool"; nombre: string; detalle: string; ok: boolean }
  | {
      clase: "whatsapp";
      cliente: string;
      estado: "enviado" | "simulado" | "fallo";
      detalle?: string;
    };

/** Un color por estado. Manda en la cinta y en la etiqueta de cada fila. */
const COLOR: Record<SegmentoRfm, string> = {
  en_riesgo: "var(--alarm)",
  perdido: "var(--bone-faint)",
  campeon: "var(--steady)",
  leal: "var(--steady)",
  potencial: "var(--amber)",
  nuevo: "var(--amber)",
  dormido: "var(--bone-dim)",
  sin_datos: "var(--bone-faint)",
};

/** Lo que el agente cuantificó con calcular_plata_en_riesgo. */
type PlataCuantificada = { pesos: number; clientes: number };

/**
 * El detalle de la herramienta viaja ya formateado para la bitácora
 * ("10 clientes · $93.830.000"). Se lee de vuelta a números aquí, en el
 * cliente, en vez de cambiar el contrato del evento por una cifra de pantalla.
 */
function leerPlata(detalle: string): PlataCuantificada | null {
  const m = detalle.match(/^(\d+)\s+clientes?\s+·\s+\$([\d.]+)/);
  if (!m) return null;
  // Formato es-CO: el punto es separador de miles, no decimal.
  return { clientes: Number(m[1]), pesos: Number(m[2].replaceAll(".", "")) };
}

export default function Chispy() {
  const [clientes, setClientes] = useState<ClienteEnriquecido[]>([]);
  const [razonamiento, setRazonamiento] = useState<Entrada[]>([]);
  const [plan, setPlan] = useState<PlanComercial | null>(null);
  /** El guion del briefing hablado, tal y como lo firmó el servidor. */
  const [briefing, setBriefing] = useState<{ texto: string; firma: string | null } | null>(
    null,
  );
  const [fase, setFase] = useState("");
  const [total, setTotal] = useState(0);
  /**
   * La cifra que el propio agente cuantificó con su herramienta, no la que
   * calcula esta pantalla por su cuenta. Vale la última: si vuelve a medir, es
   * porque cambió de grupo.
   */
  const [plataAgente, setPlataAgente] = useState<PlataCuantificada | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const [negocio, setNegocio] = useState(
    "Joyería Áurea — vende por videollamada, leads de campañas de Meta",
  );

  const cascadaRef = useRef<HTMLDivElement>(null);
  const razonRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);

  const arrancado = clientes.length > 0 || corriendo;

  const estadoOjos: EstadoOjos = plan
    ? "halla"
    : razonamiento.length > 0
      ? "piensa"
      : corriendo
        ? "busca"
        : "duerme";

  // Autoscroll de los paneles vivos: si no, la cascada se pierde por abajo.
  useEffect(() => {
    cascadaRef.current?.scrollTo({ top: cascadaRef.current.scrollHeight });
  }, [clientes.length]);

  useEffect(() => {
    razonRef.current?.scrollTo({ top: razonRef.current.scrollHeight, behavior: "smooth" });
  }, [razonamiento.length]);

  useEffect(() => {
    if (plan) planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [plan]);

  const procesar = useCallback(
    async (csv: string) => {
      setClientes([]);
      setRazonamiento([]);
      setPlan(null);
      setBriefing(null);
      setAvisos([]);
      setPlataAgente(null);
      setCorriendo(true);
      setFase("Leyendo el archivo");

      const despachar = (ev: EventoChispy) => {
        switch (ev.tipo) {
          case "inicio":
            setTotal(ev.totalClientes);
            break;
          case "cliente":
            setClientes((prev) => [...prev, ev.cliente]);
            break;
          case "fase":
            setFase(ev.nombre);
            break;
          case "razonamiento":
            setRazonamiento((prev) => [...prev, { clase: "texto", texto: ev.texto }]);
            break;
          case "herramienta":
            setRazonamiento((prev) => [
              ...prev,
              { clase: "tool", nombre: ev.nombre, detalle: ev.detalle, ok: false },
            ]);
            break;
          case "herramienta_ok":
            // La plata que cuantifica el agente no se queda en el renglón de
            // la bitácora: es el titular con el que termina el análisis.
            if (ev.nombre === "calcular_plata_en_riesgo") {
              const medido = leerPlata(ev.detalle);
              if (medido) setPlataAgente(medido);
            }
            // Cierra la última llamada abierta de esa herramienta.
            setRazonamiento((prev) => {
              const sig = [...prev];
              for (let i = sig.length - 1; i >= 0; i--) {
                const e = sig[i];
                if (e.clase === "tool" && e.nombre === ev.nombre && !e.ok) {
                  sig[i] = { ...e, ok: true, detalle: ev.detalle };
                  break;
                }
              }
              return sig;
            });
            break;
          case "whatsapp":
            setRazonamiento((prev) => [
              ...prev,
              {
                clase: "whatsapp",
                cliente: ev.cliente,
                estado: ev.estado,
                detalle: ev.detalle,
              },
            ]);
            break;
          case "plan":
            setPlan(ev.plan);
            break;
          case "briefing":
            setBriefing({ texto: ev.texto, firma: ev.firma });
            break;
          case "error":
            setAvisos((prev) => [...prev, ev.mensaje]);
            break;
        }
      };

      try {
        /*
         * Salvavidas de escenario: con ?cache en la URL se reproduce el último
         * recorrido bueno guardado en el repo, sin tocar ninguna API. Si la red
         * de la sala muere, la demo no.
         */
        const modoCache = new URLSearchParams(window.location.search).has("cache");

        if (modoCache) {
          const res = await fetch("/ejemplo/recorrido-cacheado.ndjson");
          if (!res.ok) throw new Error("No se pudo leer el recorrido cacheado.");

          for (const linea of (await res.text()).split("\n")) {
            if (!linea.trim()) continue;
            const ev = JSON.parse(linea) as EventoChispy;
            despachar(ev);
            // Ritmo artificial: cascada rápida, agente a ritmo de lectura.
            await new Promise((r) => setTimeout(r, ev.tipo === "cliente" ? 40 : 650));
          }
          return;
        }

        const res = await fetch("/api/procesar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv, negocio }),
        });

        if (!res.body) throw new Error("Sin respuesta del servidor.");

        const lector = res.body.getReader();
        const decoder = new TextDecoder();
        let resto = "";

        while (true) {
          const { done, value } = await lector.read();
          if (done) break;

          resto += decoder.decode(value, { stream: true });
          const lineas = resto.split("\n");
          resto = lineas.pop() ?? "";

          for (const linea of lineas) {
            if (!linea.trim()) continue;
            despachar(JSON.parse(linea) as EventoChispy);
          }
        }
      } catch (error) {
        setAvisos((prev) => [
          ...prev,
          error instanceof Error ? error.message : "Falló el proceso.",
        ]);
      } finally {
        setCorriendo(false);
        setFase("");
      }
    },
    [negocio],
  );

  const usarEjemplo = useCallback(async () => {
    const res = await fetch("/ejemplo/joyeria-aurea.csv");
    await procesar(await res.text());
  }, [procesar]);

  const enRiesgo = clientes.filter((c) => c.rfm.segmento === "en_riesgo");
  const plataEnRiesgo = enRiesgo.reduce((s, c) => s + c.rfm.monto, 0);
  const facturado = clientes.reduce((s, c) => s + c.rfm.monto, 0);

  // Los envíos del titular se cuentan de la misma bitácora que se ve arriba:
  // una cifra que no cuadre con lo que está escrito en pantalla es peor que
  // no tenerla.
  const envios = razonamiento.filter((e) => e.clase === "whatsapp");
  const enviados = envios.filter((e) => e.estado === "enviado").length;
  const simulados = envios.filter((e) => e.estado === "simulado").length;

  return (
    <main className="relative z-10 flex-1 px-6 py-8 md:px-12 lg:px-16">
      {/* ---------------- Cabecera ---------------- */}
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--line)] pb-7">
        <div className="flex items-end gap-5">
          <Ojos estado={estadoOjos} className="h-14 w-auto shrink-0 md:h-20" />
          <div>
            <h1 className="display text-5xl md:text-7xl">
              chi<span className="text-[var(--amber)]">spy</span>
            </h1>
            <p className="etiqueta mt-2">vigila tu base de clientes</p>
          </div>
        </div>

        {arrancado && (
          <div className="flex items-center gap-3 text-xs">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                corriendo ? "bg-[var(--amber)] latido" : "bg-[var(--steady)]"
              }`}
            />
            <span className="text-[var(--bone-dim)]">
              {fase || (plan ? "Plan listo" : "En espera")}
            </span>
          </div>
        )}
      </header>

      {/* ---------------- Reposo: la entrada ---------------- */}
      {!arrancado && (
        <section className="sube mx-auto max-w-3xl py-20 text-center md:py-28">
          <h2 className="prosa text-2xl leading-snug text-[var(--bone)] md:text-4xl">
            Tus clientes ya te dijeron todo lo que necesitas saber.
            <span className="block text-[var(--bone-faint)]">
              Está en el Excel que nadie abre.
            </span>
          </h2>

          <div className="mt-14 flex flex-col items-center gap-4">
            <input
              value={negocio}
              onChange={(e) => setNegocio(e.target.value)}
              placeholder="Nombre del negocio"
              className="w-full max-w-sm border-b border-[var(--line)] bg-transparent px-2 py-3 text-center text-sm text-[var(--bone)] outline-none transition-colors placeholder:text-[var(--bone-faint)] focus:border-[var(--amber)]"
            />

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={usarEjemplo}
                className="rounded-full bg-[var(--amber)] px-8 py-4 text-sm font-semibold tracking-wide text-[var(--void)] transition-transform hover:scale-[1.03] active:scale-95"
              >
                Analizar base de ejemplo
              </button>

              {/* El input va en sr-only y no oculto: `hidden` lo saca del orden
                  de tabulación y dejaba este botón sin forma de alcanzarlo con
                  el teclado. El foco se pinta sobre la etiqueta, que es lo que
                  se ve. */}
              <label className="cursor-pointer rounded-full border border-[var(--line)] px-8 py-4 text-sm text-[var(--bone-dim)] transition-colors hover:border-[var(--amber)] hover:text-[var(--bone)]">
                Subir mi CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={async (e) => {
                    const archivo = e.target.files?.[0];
                    if (archivo) await procesar(await archivo.text());
                  }}
                />
              </label>
            </div>

            <p className="prosa mt-8 max-w-md text-xs leading-relaxed text-[var(--bone-faint)]">
              Chispy no busca a tus clientes en redes sociales. Usa lo que ellos ya te
              dieron y datos públicos de zona. Cumple la Ley 1581 por diseño.
            </p>
          </div>
        </section>
      )}

      {/* ---------------- Trabajo ---------------- */}
      {arrancado && (
        <>
          {/*
            El instrumento. Una sola cifra manda —la plata que se está yendo— y
            todo lo demás de esta pantalla existe para explicarla. Las otras
            tres lecturas bajan a renglones de factura, que es lo que son.
          */}
          <section className="panel mt-8">
            <div className="grid gap-px bg-[var(--line)] lg:grid-cols-[1.5fr_1fr]">
              <div className="bg-[var(--surface)] px-6 py-7 md:px-8">
                <span className="etiqueta">Plata en riesgo</span>
                <div className="cifra display mt-3 text-[clamp(2.5rem,7vw,5rem)] text-[var(--alarm)]">
                  {pesos(plataEnRiesgo)}
                </div>
                <p className="prosa mt-3 text-sm leading-relaxed text-[var(--bone-dim)]">
                  {enRiesgo.length > 0
                    ? `${enRiesgo.length} clientes que ya te compraron y llevan meses sin volver.`
                    : "Todavía leyendo la base."}
                </p>
              </div>

              <div className="flex flex-col justify-center bg-[var(--surface)] px-6 py-5 md:px-8">
                <Lectura
                  etiqueta="Clientes leídos"
                  valor={`${clientes.length} de ${total || "?"}`}
                />
                <Lectura etiqueta="Facturado" valor={pesos(facturado)} />
                <Lectura etiqueta="Clientes en riesgo" valor={`${enRiesgo.length}`} acento />
              </div>
            </div>

            <Cinta clientes={clientes} total={total} />
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            {/* Cascada */}
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
                <span className="etiqueta">La base, enriquecida</span>
                <span className="cifra text-xs text-[var(--bone-faint)]">
                  {clientes.length}
                </span>
              </div>
              <div ref={cascadaRef} className="max-h-[27rem] overflow-y-auto">
                {clientes.map((c) => (
                  <Fila key={c.id} c={c} />
                ))}
              </div>
            </div>

            {/* Razonamiento */}
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
                <span className="etiqueta">El agente está pensando</span>
                {/* El muñequito del agente: quien de verdad está haciendo el trabajo. */}
                <Image
                  src="/mascota.png"
                  alt="El agente de Chispy"
                  width={23}
                  height={32}
                  className="opacity-90"
                />
              </div>
              <div ref={razonRef} className="max-h-[27rem] overflow-y-auto px-5 py-4">
                {razonamiento.length === 0 ? (
                  <p className="prosa text-sm italic text-[var(--bone-faint)]">
                    Esperando a terminar de leer la base…
                  </p>
                ) : (
                  razonamiento.map((e, i) => (
                    <Paso key={i} e={e} viva={i === razonamiento.length - 1 && corriendo} />
                  ))
                )}
              </div>
            </div>
          </section>

          {avisos.length > 0 && (
            <ul className="mt-5 space-y-1">
              {avisos.map((a, i) => (
                <li key={i} className="prosa text-xs text-[var(--alarm)]">
                  ⚠ {a}
                </li>
              ))}
            </ul>
          )}

          {/* ---------------- El plan ---------------- */}
          {plan && (
            <section ref={planRef} className="sube mt-16 scroll-mt-8">
              {/*
                El titular. Va antes que el plan porque es la respuesta: el
                plan es el cómo. La plata sale de lo que midió el agente con su
                herramienta, no de la cuenta que hace esta pantalla — si él
                decidió sobre otro grupo, la cifra del titular es la suya.
              */}
              <Titular
                plata={plataAgente?.pesos ?? plataEnRiesgo}
                clientesPlata={plataAgente?.clientes ?? enRiesgo.length}
                medidaPorElAgente={plataAgente !== null}
                analizados={total || clientes.length}
                enviados={enviados}
                simulados={simulados}
              />

              <div className="mb-8 border-t border-[var(--line)] pt-8">
                <span className="etiqueta">El plan de esta semana</span>
                <p className="prosa mt-4 max-w-3xl text-lg leading-relaxed text-[var(--bone)] md:text-2xl">
                  {plan.resumen}
                </p>
              </div>

              {/*
                El briefing hablado. Llega un instante después del plan, por eso
                se monta aparte: el plan no espera a la voz para pintarse.
              */}
              {briefing && (
                <div className="sube mb-10">
                  {/* La key remonta el reproductor con cada briefing nuevo: así
                      nunca queda sonando el audio del análisis anterior. */}
                  <Voz key={briefing.texto} texto={briefing.texto} firma={briefing.firma} />
                </div>
              )}

              <div className="grid gap-5 lg:grid-cols-2">
                {plan.segmentos.map((s, i) => (
                  <Tarjeta key={s.nombre} s={s} orden={i} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

const prefiereQuieto = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Cuenta una cifra desde cero al aparecer.
 *
 * Es el único adorno del titular, y está por una razón: una cifra que se planta
 * es un número, una que sube es una cuenta corriendo. Con prefers-reduced-motion
 * aparece ya puesta.
 */
function useConteo(valor: number, ms = 1200) {
  const [n, setN] = useState(() => (prefiereQuieto() ? valor : 0));

  useEffect(() => {
    if (prefiereQuieto()) {
      setN(valor);
      return;
    }

    let cuadro = 0;
    const t0 = performance.now();

    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      // Frenada fuerte al final: llega enseguida al orden de magnitud —que es
      // lo que hay que leer— y las últimas cifras se asientan solas.
      setN(valor * (1 - (1 - p) ** 4));
      if (p < 1) cuadro = requestAnimationFrame(paso);
    };

    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor, ms]);

  return n;
}

/**
 * El titular.
 *
 * Lo primero que tiene que leer alguien cuando el análisis termina, y lo único
 * que se ve desde el fondo de la sala: cuánta plata está en juego, sobre
 * cuántos clientes se miró y cuántos mensajes salieron ya. La plata es más
 * grande que ninguna otra cosa de la pantalla a propósito — el resto de esta
 * página existe para explicarla.
 */
function Titular({
  plata,
  clientesPlata,
  medidaPorElAgente,
  analizados,
  enviados,
  simulados,
}: {
  plata: number;
  clientesPlata: number;
  /** Falso solo si el agente cerró el plan sin llegar a cuantificar nada. */
  medidaPorElAgente: boolean;
  analizados: number;
  enviados: number;
  simulados: number;
}) {
  const plataViva = useConteo(plata);
  const analizadosVivos = useConteo(analizados);

  // Sin ningún envío real el titular no puede decir "enviados": lo que hubo
  // fueron ensayos, y delante de un jurado esa diferencia lo es todo.
  const soloSimulados = enviados === 0 && simulados > 0;

  const notaEnvios = soloSimulados
    ? "Ninguno salió de verdad: no había número de prueba configurado."
    : enviados === 0
      ? "El agente cerró el plan sin escribirle a nadie todavía."
      : simulados > 0
        ? `Salieron de verdad, redirigidos al número de prueba. Otros ${simulados} quedaron simulados.`
        : "Salieron de verdad, redirigidos al número de prueba.";

  return (
    <div className="lamina mb-10 overflow-hidden">
      <div className="px-6 py-9 md:px-10 md:py-12">
        <span className="etiqueta">Plata en riesgo</span>
        {/* La cifra manda sobre todo: por encima del instrumento de arriba y
            del propio nombre del producto. */}
        <div className="cifra display mt-4 text-[clamp(2.5rem,9.5vw,8.5rem)] text-[var(--alarm)]">
          {pesos(plataViva)}
        </div>
        <p className="prosa mt-5 max-w-2xl text-sm leading-relaxed text-[var(--bone-dim)] md:text-base">
          {medidaPorElAgente
            ? `Lo que suman los ${clientesPlata} clientes que el agente midió antes de decidir a quién escribirle.`
            : `Lo que suman los ${clientesPlata} clientes de la base que ya te compraron y se están yendo.`}
        </p>
      </div>

      <div className="grid gap-px border-t border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
        <Marca
          etiqueta="Clientes analizados"
          valor={`${analizadosVivos}`}
          nota="Toda la base, enriquecida por zona y comportamiento."
        />
        <Marca
          etiqueta={soloSimulados ? "WhatsApp simulados" : "WhatsApp enviados"}
          valor={`${soloSimulados ? simulados : enviados}`}
          color={soloSimulados ? "var(--amber)" : "var(--steady)"}
          nota={notaEnvios}
        />
      </div>
    </div>
  );
}

/** Una de las dos cifras de apoyo del titular. */
function Marca({
  etiqueta,
  valor,
  nota,
  color = "var(--bone)",
}: {
  etiqueta: string;
  valor: string;
  nota: string;
  color?: string;
}) {
  return (
    <div className="bg-[var(--surface)] px-6 py-6 md:px-10 md:py-7">
      <span className="etiqueta">{etiqueta}</span>
      <div
        className="cifra display mt-2 text-[clamp(1.75rem,4vw,3rem)]"
        style={{ color }}
      >
        {valor}
      </div>
      <p className="prosa mt-2 text-xs leading-relaxed text-[var(--bone-faint)]">{nota}</p>
    </div>
  );
}

/**
 * Una tarjeta de segmento, con su envío real.
 *
 * El campo de teléfono es el final de la demo: se le pide el número a alguien
 * del jurado, se pulsa enviar, y le vibra el móvil. Por eso está a la vista y no
 * escondido detrás de un menú.
 */
function Tarjeta({ s, orden }: { s: Segmento; orden: number }) {
  const [telefono, setTelefono] = useState("");
  const [envio, setEnvio] = useState<
    | { estado: "quieto" }
    | { estado: "enviando" }
    | { estado: "hecho"; a: string; hora: string }
    | { estado: "falla"; motivo: string; pista?: string }
  >({ estado: "quieto" });

  const texto = s.mensaje.replaceAll("{{nombre}}", "Andrea");

  async function enviar() {
    setEnvio({ estado: "enviando" });
    try {
      const res = await fetch("/api/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, mensaje: texto }),
      });
      const r = await res.json();
      setEnvio(
        r.ok
          ? {
              estado: "hecho",
              a: r.a,
              // La hora se toma cuando el mensaje sale de verdad, no al pintar
              // la tarjeta: es la que va a aparecer en el móvil de enfrente.
              hora: new Date().toLocaleTimeString("es-CO", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            }
          : { estado: "falla", motivo: r.motivo, pista: r.pista },
      );
    } catch {
      setEnvio({ estado: "falla", motivo: "No se pudo contactar con el servidor." });
    }
  }

  return (
    <article
      className="lamina sube flex flex-col p-6"
      style={{ animationDelay: `${orden * 90}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="display text-2xl text-[var(--amber)] md:text-3xl">{s.nombre}</h3>
        <span className="cifra shrink-0 rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--bone-dim)]">
          {s.clienteIds.length}
        </span>
      </div>

      <p className="prosa mt-3 text-sm leading-relaxed text-[var(--bone-dim)]">
        {s.descripcion}
      </p>

      <div className="mt-5 border-l-2 border-[var(--amber-deep)] pl-4">
        <span className="etiqueta">Oferta</span>
        <p className="prosa mt-1 text-sm text-[var(--bone)]">{s.oferta}</p>
      </div>

      {/*
        El mensaje, tal cual va a llegarle al cliente.

        Va con los colores, el rabito y los acuses de WhatsApp a propósito: en
        la demo esto es lo último que se ve antes de que a alguien del jurado le
        vibre el móvil, y tiene que parecerse a lo que le va a llegar. Sale a la
        derecha porque es un mensaje que manda el negocio, no que recibe.
      */}
      <div className="mt-6">
        <span className="etiqueta">Por {s.canal}</span>
        <div className="mt-2 rounded-sm bg-[#0b141a] px-3 py-3">
          <div className="relative ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#005c4b] py-2 pr-3 pl-3">
            {/* El rabito. */}
            <span
              aria-hidden
              className="absolute top-0 -right-[7px] h-[13px] w-[9px] bg-[#005c4b]"
              style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
            />

            <p className="prosa text-[13.5px] leading-relaxed text-[#e9edef]">
              {texto}
              {/* Hueco reservado para que la hora no se monte sobre la última
                  línea del mensaje, como hace WhatsApp de verdad. */}
              <span aria-hidden className="inline-block w-[4.5rem]" />
            </p>

            <span className="absolute right-2.5 bottom-1.5 flex items-center gap-1 text-[10px] text-white/60">
              {envio.estado === "hecho" ? (
                <>
                  {envio.hora}
                  <VistoDoble />
                </>
              ) : (
                /* Todavía no ha salido del dispositivo: el reloj de WhatsApp
                   dice exactamente eso, y poner los dos checks aquí sería un
                   acuse de recibo inventado. */
                <Pendiente />
              )}
            </span>
          </div>
        </div>
      </div>

      {/* El botón que convierte un plan en un móvil vibrando. */}
      <div className="mt-5">
        {envio.estado === "hecho" ? (
          <p className="prosa text-sm text-[var(--steady)]">
            Enviado a {envio.a}. Mira el celular.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && telefono && enviar()}
                placeholder="300 123 4567"
                inputMode="tel"
                className="cifra min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--void)] px-3 py-2.5 text-sm text-[var(--bone)] outline-none transition-colors placeholder:text-[var(--bone-faint)] focus:border-[var(--amber)]"
              />
              <button
                onClick={enviar}
                disabled={!telefono || envio.estado === "enviando"}
                className="shrink-0 rounded-md bg-[var(--amber)] px-5 py-2.5 text-sm font-semibold text-[var(--void)] transition-transform hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {envio.estado === "enviando" ? "Enviando…" : "Enviar"}
              </button>
            </div>
            {envio.estado === "falla" && (
              <p className="prosa mt-2 text-xs leading-relaxed text-[var(--alarm)]">
                {envio.motivo}
                {envio.pista && (
                  <span className="block text-[var(--bone-faint)]">{envio.pista}</span>
                )}
              </p>
            )}
          </>
        )}
      </div>

      <p className="prosa mt-auto pt-6 text-xs leading-relaxed text-[var(--bone-faint)]">
        {s.justificacion}
      </p>
    </article>
  );
}

/** El reloj de WhatsApp: escrito, todavía sin salir del dispositivo. */
function Pendiente() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" aria-hidden>
      <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 4.4V8l2.4 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** El doble check azul. En Colombia esto no hay que explicarlo. */
function VistoDoble() {
  return (
    <svg viewBox="0 0 16 11" className="h-[11px] w-4 shrink-0" aria-hidden>
      {["M1 5.9 3.6 8.6 9.3 1.6", "M6.2 5.9 8.8 8.6 14.5 1.6"].map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="#53bdeb"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** Una entrada de la bitácora del agente: dice algo, llama una herramienta o envía. */
function Paso({ e, viva }: { e: Entrada; viva: boolean }) {
  if (e.clase === "texto") {
    return (
      <p
        className={`prosa entra mb-3 text-sm leading-relaxed text-[var(--bone-dim)] ${
          viva ? "cursor" : ""
        }`}
      >
        {e.texto}
      </p>
    );
  }

  if (e.clase === "tool") {
    return (
      <p className="entra mb-3 flex items-baseline gap-2 text-xs">
        <span className={e.ok ? "text-[var(--steady)]" : "latido text-[var(--amber)]"}>▸</span>
        <span className="shrink-0 text-[var(--amber)]">{e.nombre}</span>
        <span className="truncate text-[var(--bone-faint)]">{e.detalle}</span>
      </p>
    );
  }

  // El envío: lo que la demo quiere que se lea desde el fondo de la sala.
  const borde =
    e.estado === "enviado"
      ? "border-[var(--steady)]"
      : e.estado === "fallo"
        ? "border-[var(--alarm)]"
        : "border-[var(--line)]";

  return (
    <div className={`entra mb-3 rounded-md border ${borde} bg-[var(--surface-hi)] px-3 py-2`}>
      <p className="text-xs text-[var(--bone)]">
        {e.estado === "fallo" ? "✗" : "✓"} WhatsApp a <strong>{e.cliente}</strong>
        {" — "}
        <span
          className={
            e.estado === "enviado"
              ? "font-semibold text-[var(--steady)]"
              : e.estado === "fallo"
                ? "text-[var(--alarm)]"
                : "text-[var(--bone-dim)]"
          }
        >
          {e.estado === "enviado" ? "ENVIADO" : e.estado === "simulado" ? "simulado" : "falló"}
        </span>
      </p>
      {e.detalle && <p className="mt-0.5 text-[10px] text-[var(--bone-faint)]">{e.detalle}</p>}
    </div>
  );
}

/**
 * La cinta.
 *
 * Es la firma de la pantalla. Cada cliente que entra deja su propia muesca: lo
 * alto es lo que factura, el color es en qué estado está. Cuando termina de
 * correr no queda una barra al 100%, queda la forma del negocio — y desde el
 * fondo de la sala se ve lo único que hace falta ver, que las muescas más altas
 * son rojas.
 *
 * También hace de barra de progreso: la tira crece hacia la derecha a medida
 * que se lee la base, así que no hacen falta las dos cosas.
 */
function Cinta({ clientes, total }: { clientes: ClienteEnriquecido[]; total: number }) {
  // El cliente más grande fija la altura; el resto se mide contra él.
  const techo = Math.max(...clientes.map((c) => c.rfm.monto), 1);
  const avance = total > 0 ? `${(clientes.length / total) * 100}%` : "100%";

  return (
    <div className="border-t border-[var(--line)] px-6 pb-5 pt-6 md:px-8">
      {/*
        Los datos de cada muesca están ya en la cascada de abajo, fila a fila y
        en texto. Aquí sobran cuarenta nodos sin nombre para un lector de
        pantalla: esto es la misma verdad, dibujada.
      */}
      <div aria-hidden className="flex h-20 items-end md:h-28">
        <div className="flex h-full items-end gap-px" style={{ width: avance }}>
          {clientes.map((c) => (
            <span
              key={c.id}
              className="crece min-w-px flex-1 rounded-[1px]"
              style={{
                height: `${Math.max(4, (c.rfm.monto / techo) * 100)}%`,
                background: COLOR[c.rfm.segmento],
              }}
              title={`${c.nombre ?? "sin nombre"} — ${ETIQUETAS_RFM[c.rfm.segmento]}, ${pesos(c.rfm.monto)}`}
            />
          ))}
        </div>
      </div>

      <p className="prosa mt-4 text-xs leading-relaxed text-[var(--bone-faint)]">
        Cada muesca es un cliente. Lo alto es lo que te factura; lo rojo, lo que
        se está yendo.
      </p>
    </div>
  );
}

/** Un renglón de factura: la etiqueta, su guía punteada y la cifra. */
function Lectura({
  etiqueta,
  valor,
  acento,
}: {
  etiqueta: string;
  valor: string;
  acento?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 py-2.5">
      {/* La etiqueta cede antes que la cifra: en una pantalla estrecha se
          prefiere que se parta un rótulo a que se salga la plata. */}
      <span className="etiqueta">{etiqueta}</span>
      <span aria-hidden className="guia min-w-3 flex-1" />
      <span
        className={`cifra shrink-0 text-base md:text-lg ${
          acento ? "text-[var(--alarm)]" : "text-[var(--bone)]"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}

function Fila({ c }: { c: ClienteEnriquecido }) {
  const sinZona = c.zona.confianza === "fallida";

  return (
    <div className="entra flex items-center gap-4 border-b border-[var(--line)] px-5 py-2.5 text-sm last:border-0">
      <span className="min-w-0 flex-1 truncate text-[var(--bone)]">
        {c.nombre ?? "(sin nombre)"}
      </span>

      <span className="hidden w-32 truncate text-xs text-[var(--bone-dim)] sm:block">
        {sinZona ? (
          <em className="text-[var(--bone-faint)]">zona no determinada</em>
        ) : (
          c.zona.localidad
        )}
      </span>

      {/* Estrato como seis muescas: se lee sin tener que leer un número. */}
      <span
        className="hidden items-center gap-[3px] md:flex"
        title={sinZona ? "" : `Estrato ${c.zona.estratoPredominante}`}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <span
            key={n}
            className="h-3.5 w-1 rounded-sm"
            style={{
              background:
                !sinZona && n <= c.zona.estratoPredominante
                  ? `var(--e${c.zona.estratoPredominante})`
                  : "var(--line)",
            }}
          />
        ))}
      </span>

      {/* La etiqueta lleva su punto de color: el mismo con el que este cliente
          aparece en la cinta, así una cosa explica la otra. */}
      <span
        className="flex w-24 shrink-0 items-center justify-end gap-1.5 text-right text-xs"
        style={{ color: COLOR[c.rfm.segmento] }}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: COLOR[c.rfm.segmento] }}
        />
        {ETIQUETAS_RFM[c.rfm.segmento]}
      </span>

      <span className="cifra w-28 shrink-0 text-right text-xs text-[var(--bone-dim)]">
        {pesos(c.rfm.monto)}
      </span>
    </div>
  );
}

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

const TONO: Record<SegmentoRfm, string> = {
  en_riesgo: "text-[var(--alarm)]",
  perdido: "text-[var(--bone-faint)]",
  campeon: "text-[var(--steady)]",
  leal: "text-[var(--steady)]",
  potencial: "text-[var(--amber)]",
  nuevo: "text-[var(--amber)]",
  dormido: "text-[var(--bone-dim)]",
  sin_datos: "text-[var(--bone-faint)]",
};

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
  const [avisos, setAvisos] = useState<string[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const [negocio, setNegocio] = useState("Veterinaria Huellitas");

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
    const res = await fetch("/ejemplo/veterinaria-huellitas.csv");
    await procesar(await res.text());
  }, [procesar]);

  const enRiesgo = clientes.filter((c) => c.rfm.segmento === "en_riesgo");
  const plataEnRiesgo = enRiesgo.reduce((s, c) => s + c.rfm.monto, 0);
  const facturado = clientes.reduce((s, c) => s + c.rfm.monto, 0);

  return (
    <main className="relative z-10 flex-1 px-6 py-8 md:px-12 lg:px-16">
      {/* ---------------- Cabecera ---------------- */}
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--line)] pb-7">
        <div className="flex items-end gap-5">
          <Ojos estado={estadoOjos} className="h-14 w-auto shrink-0 md:h-20" />
          <div>
            <h1 className="display text-5xl md:text-7xl">chispy</h1>
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

              <label className="cursor-pointer rounded-full border border-[var(--line)] px-8 py-4 text-sm text-[var(--bone-dim)] transition-colors hover:border-[var(--amber)] hover:text-[var(--bone)]">
                Subir mi CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
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
          <section className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] lg:grid-cols-4">
            <Metrica
              etiqueta="Clientes leídos"
              valor={`${clientes.length}`}
              sufijo={`de ${total || "?"}`}
            />
            <Metrica etiqueta="Facturación en la base" valor={pesos(facturado)} />
            <Metrica etiqueta="Clientes en riesgo" valor={`${enRiesgo.length}`} acento />
            <Metrica etiqueta="Plata en riesgo" valor={pesos(plataEnRiesgo)} acento grande />
          </section>

          {corriendo && (
            <div className="relative mt-4 h-0.5 w-full overflow-hidden bg-[var(--line)]">
              <div
                className="h-full bg-[var(--amber)] transition-[width] duration-200"
                style={{ width: total ? `${(clientes.length / total) * 100}%` : "0%" }}
              />
              {total > 0 && clientes.length === total && (
                <div className="barrido absolute inset-0" />
              )}
            </div>
          )}

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            {/* Cascada */}
            <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">
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
            <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">
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
    | { estado: "hecho"; a: string }
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
          ? { estado: "hecho", a: r.a }
          : { estado: "falla", motivo: r.motivo, pista: r.pista },
      );
    } catch {
      setEnvio({ estado: "falla", motivo: "No se pudo contactar con el servidor." });
    }
  }

  return (
    <article
      className="sube flex flex-col rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6"
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

      {/* El mensaje, tal cual va a llegarle al cliente. */}
      <div className="mt-6">
        <span className="etiqueta">Por {s.canal}</span>
        <div className="mt-2 max-w-[92%] rounded-2xl rounded-tl-sm bg-[#075E54] px-4 py-3">
          <p className="prosa text-sm leading-relaxed text-white">{texto}</p>
        </div>
      </div>

      {/* El botón que convierte un plan en un móvil vibrando. */}
      <div className="mt-5">
        {envio.estado === "hecho" ? (
          <p className="prosa text-sm text-[var(--steady)]">
            ✓ Enviado a {envio.a}. Mira el móvil.
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

function Metrica({
  etiqueta,
  valor,
  sufijo,
  acento,
  grande,
}: {
  etiqueta: string;
  valor: string;
  sufijo?: string;
  acento?: boolean;
  grande?: boolean;
}) {
  return (
    <div className="bg-[var(--surface)] px-5 py-5">
      <span className="etiqueta">{etiqueta}</span>
      <div
        className={`cifra display mt-2 ${
          grande ? "text-3xl md:text-5xl" : "text-2xl md:text-4xl"
        } ${acento ? "text-[var(--alarm)]" : "text-[var(--bone)]"}`}
      >
        {valor}
      </div>
      {sufijo && <span className="text-xs text-[var(--bone-faint)]">{sufijo}</span>}
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

      <span className={`w-24 shrink-0 text-right text-xs ${TONO[c.rfm.segmento]}`}>
        {ETIQUETAS_RFM[c.rfm.segmento]}
      </span>

      <span className="cifra w-28 shrink-0 text-right text-xs text-[var(--bone-dim)]">
        {pesos(c.rfm.monto)}
      </span>
    </div>
  );
}

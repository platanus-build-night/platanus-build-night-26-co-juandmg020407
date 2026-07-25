"use client";

/**
 * El briefing hablado.
 *
 * El dueño de la pyme acaba de ver cuarenta clientes pasar por pantalla, un
 * agente razonando y cuatro tarjetas de plan. Esto es lo que se lleva a casa:
 * treinta segundos en los que alguien le dice, en su idioma y con sus cifras,
 * qué encontró y por dónde empezar.
 *
 * Tres reglas gobiernan este componente, y las tres son de dinero:
 *
 *   1. Nunca suena solo. Sin clic no hay audio, y sin audio no hay gasto.
 *   2. Se genera UNA vez por análisis. El MP3 se queda en memoria; pausar,
 *      reanudar o volver a escuchar no vuelve a tocar ElevenLabs.
 *   3. Si la voz falla, no pasa nada. El texto sigue en pantalla y el resto de
 *      Chispy ni se entera.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Estado =
  | { fase: "quieto" }
  | { fase: "generando" }
  | { fase: "sonando" }
  | { fase: "pausado" }
  | { fase: "terminado" }
  | { fase: "error"; motivo: string };

export function Voz({ texto, firma }: { texto: string; firma: string | null }) {
  const [estado, setEstado] = useState<Estado>({ fase: "quieto" });
  const [disponible, setDisponible] = useState<boolean | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  /*
   * ¿Hay voz en este entorno? Es una comprobación de configuración, no de
   * síntesis: no gasta un solo crédito. Sirve para no enseñar un botón que
   * llevaría a un 503 delante del jurado.
   */
  useEffect(() => {
    let vivo = true;

    fetch("/api/voz")
      .then((r) => r.json())
      .then((r: { disponible?: boolean }) => vivo && setDisponible(Boolean(r.disponible)))
      .catch(() => vivo && setDisponible(false));

    return () => {
      vivo = false;
    };
  }, []);

  /*
   * Al desmontar se tira el audio y se libera su ObjectURL; sin esto el blob se
   * quedaría retenido en memoria toda la sesión. Un análisis nuevo remonta el
   * componente entero (`key` en page.tsx), así que este cleanup también es el
   * que borra el briefing anterior.
   */
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  const alPulsar = useCallback(async () => {
    // Doble clic nervioso durante la generación: se ignora. Es la puerta por la
    // que se colarían dos facturas por el mismo briefing.
    if (estado.fase === "generando") return;

    const audio = audioRef.current;

    if (audio) {
      if (audio.paused) await audio.play().catch(() => setEstado({ fase: "pausado" }));
      else audio.pause();
      return;
    }

    setEstado({ fase: "generando" });

    try {
      const res = await fetch("/api/voz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, firma }),
      });

      if (!res.ok) {
        const { motivo } = (await res.json().catch(() => ({}))) as { motivo?: string };
        setEstado({ fase: "error", motivo: motivo ?? "No se pudo generar la voz." });
        return;
      }

      const url = URL.createObjectURL(await res.blob());
      urlRef.current = url;

      const nuevo = new Audio(url);
      nuevo.addEventListener("play", () => setEstado({ fase: "sonando" }));
      nuevo.addEventListener("pause", () =>
        setEstado((prev) => (prev.fase === "terminado" ? prev : { fase: "pausado" })),
      );
      nuevo.addEventListener("ended", () => setEstado({ fase: "terminado" }));
      audioRef.current = nuevo;

      await nuevo.play();
    } catch {
      setEstado({ fase: "error", motivo: "No se pudo contactar con el servidor." });
    }
  }, [estado.fase, texto, firma]);

  // Sin firma no hay forma de pedir la síntesis (pasa en el modo ?cache, que
  // corre sin servidor). El texto se sigue leyendo; el botón no tiene sentido.
  const puedeSonar = disponible === true && Boolean(firma);

  const etiquetaBoton =
    estado.fase === "generando"
      ? "Generando voz…"
      : estado.fase === "sonando"
        ? "Pausar"
        : estado.fase === "pausado"
          ? "Continuar"
          : estado.fase === "terminado"
            ? "Escuchar de nuevo"
            : "Escuchar resumen";

  return (
    <section
      aria-labelledby="voz-titulo"
      className="lamina mt-8 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span id="voz-titulo" className="etiqueta">
          El resumen, en voz alta
        </span>

        {estado.fase === "sonando" && <Ondas />}
      </div>

      {/*
        El mismo guion que se escucha, escrito. Es la alternativa accesible para
        quien no puede oírlo, y de paso deja ver que la voz no se inventa nada:
        dice exactamente esto.
      */}
      <p className="prosa mt-4 max-w-3xl text-base leading-relaxed text-[var(--bone-dim)]">
        {texto}
      </p>

      {puedeSonar ? (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={alPulsar}
            disabled={estado.fase === "generando"}
            aria-busy={estado.fase === "generando"}
            className="rounded-full bg-[var(--amber)] px-7 py-3 text-sm font-semibold tracking-wide text-[var(--void)] transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {etiquetaBoton}
          </button>

          {/* El estado, también escrito: en un proyector el audio puede no llegar. */}
          <span aria-live="polite" className="text-xs text-[var(--bone-faint)]">
            {estado.fase === "generando" && "Sintetizando con ElevenLabs…"}
            {estado.fase === "sonando" && "Sonando"}
            {estado.fase === "pausado" && "En pausa"}
            {estado.fase === "terminado" && "Ya suena sin volver a generarlo"}
            {estado.fase === "error" && (
              <span className="text-[var(--alarm)]">{estado.motivo} Puedes reintentar.</span>
            )}
          </span>
        </div>
      ) : (
        disponible === false && (
          <p className="mt-5 text-xs text-[var(--bone-faint)]">
            La voz no está activada en este entorno. El resumen se queda escrito.
          </p>
        )
      )}
    </section>
  );
}

/** Cinco barras desfasadas: el indicador de que esto está sonando ahora mismo. */
function Ondas() {
  return (
    <span aria-hidden className="flex items-center gap-[3px]">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="onda h-4 w-[3px] rounded-full bg-[var(--amber)]"
          style={{ animationDelay: `${i * 0.13}s` }}
        />
      ))}
    </span>
  );
}

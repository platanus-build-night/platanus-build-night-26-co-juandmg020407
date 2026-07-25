"use client";

/**
 * La mascota.
 *
 * El mono de los platillos, en la cabecera del panel donde el agente razona:
 * mientras la máquina piensa, alguien tiene que estar tocando los platillos.
 *
 * Es vídeo y no un GIF por peso —el mismo medio segundo de mono cuesta la
 * mitad en h.264— y porque un GIF de tres megas se descodifica en el hilo
 * principal justo mientras entra el stream del agente. El póster es el mono
 * quieto: si el vídeo tarda en llegar, el hueco nunca está vacío.
 *
 * Sin sonido y sin controles: es un adorno, no un reproductor.
 */

export function Mascota({ className = "" }: { className?: string }) {
  return (
    <video
      src="/chispy-despierta.mp4"
      poster="/mascota.png"
      autoPlay
      loop
      muted
      playsInline
      // El navegador no descarga el vídeo hasta que el panel existe, y el panel
      // no existe hasta que hay base cargada — para entonces sobra tiempo.
      preload="auto"
      aria-hidden="true"
      className={`shrink-0 rounded-lg border border-[var(--line)] object-cover ${className}`}
    />
  );
}

/**
 * Los ojos.
 *
 * Toda la identidad de Chispy en dos elipses. Evocan al mono de los platillos
 * sin dibujarlo — lo cual, además de ser mejor diseño, evita meterse con la
 * propiedad intelectual de nadie.
 *
 * El estado no es decorativo: dice qué está haciendo el sistema. Barren mientras
 * lee la base, miran arriba mientras el agente razona, y se clavan al frente
 * cuando hay un veredicto.
 */

export type EstadoOjos = "duerme" | "busca" | "piensa" | "halla";

const MOVIMIENTO: Record<EstadoOjos, string> = {
  duerme: "ojos-quieto",
  busca: "ojos-barre",
  piensa: "ojos-arriba",
  halla: "ojos-fija",
};

export function Ojos({
  estado = "duerme",
  className = "",
}: {
  estado?: EstadoOjos;
  className?: string;
}) {
  const alerta = estado === "halla";

  return (
    <svg
      viewBox="0 0 104 58"
      className={className}
      role="img"
      aria-label={`Chispy — ${estado}`}
    >
      <defs>
        {/* Brillo húmedo: sin esto los ojos parecen dos pegatinas. */}
        <radialGradient id="humedad" cx="38%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#f2ece3" />
          <stop offset="100%" stopColor="#cbbfb2" />
        </radialGradient>
        <filter id="hundido" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dy="1.5" stdDeviation="1.6" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>

      <g className="ojos-parpadeo" style={{ transformOrigin: "52px 29px" }}>
        {[30, 74].map((cx) => (
          <g key={cx}>
            <ellipse
              cx={cx}
              cy={29}
              rx={25}
              ry={27}
              fill="url(#humedad)"
              filter="url(#hundido)"
            />
            <g className={MOVIMIENTO[estado]}>
              <circle
                cx={cx}
                cy={29}
                r={alerta ? 12.5 : 10.5}
                fill="#0c0a09"
                style={{ transition: "r 0.28s cubic-bezier(0.16,1,0.3,1)" }}
              />
              {/* Reflejo. Va con la pupila, no con el globo. */}
              <circle cx={cx - 4} cy={24.5} r={3.1} fill="#fff" opacity={0.9} />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}

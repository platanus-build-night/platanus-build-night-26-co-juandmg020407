# Chispy

**Tus clientes ya te dijeron todo lo que necesitas saber. Está en el Excel que nadie abre.**

<img src="./project-logo.png" alt="Chispy" width="160" />

Chispy toma la base de clientes de una pyme colombiana, la enriquece con datos
públicos de Bogotá, decide a quién hay que contactar esta semana —con qué oferta,
por qué canal y con qué mensaje exacto— y lo envía por WhatsApp.

**Demo en vivo:** https://chispy.vercel.app

Hacker:

- David Morales Galindo ([@juandmg020407](https://github.com/juandmg020407))

---

## El problema

Una veterinaria de Chapinero tiene 400 clientes en un Excel. Sabe que algunos
dejaron de venir, pero no cuáles, ni cuánto vale recuperarlos, ni qué decirles.
No va a contratar un analista, y las herramientas de CRM están pensadas para
empresas que ya tienen un equipo de marketing.

El dato está ahí. Lo que falta es alguien que lo mire.

## Qué hace

Se sube un CSV —el que exporta el negocio, sin limpiar— y Chispy:

1. **Lo entiende.** Punto y coma de Excel en español, BOM, `4.850.000` como
   monto, fechas `DD/MM/YYYY`, celulares con espacios. Detecta las columnas por
   sí solo: nadie va a mapear campos en una demo.
2. **Lo enriquece.** Calcula recencia, frecuencia y monto por cliente, y resuelve
   el barrio en texto sucio (`"Cra 15 #93-60, Chicó"`) contra las 20 localidades
   de Bogotá, con tolerancia a erratas, para asociarle su estrato predominante.
3. **Lo analiza.** Un agente sobre Claude recorre la base y decide dónde está la
   plata en riesgo, qué segmentos merecen una acción distinta y qué mensaje
   concreto va a funcionar con cada uno.
4. **Lo ejecuta.** Cada segmento trae su mensaje listo y un botón que lo manda
   por WhatsApp de verdad.

El razonamiento del agente se emite en streaming mientras ocurre, así que el
dueño del negocio ve *por qué* se tomó cada decisión, no solo el resultado.

## Sobre los datos

Chispy **no** busca a los clientes en redes sociales, ni compra bases, ni infiere
perfiles. Trabaja con dos cosas:

- **Lo que el cliente ya le dio al negocio** — sus propias ventas.
- **Datos públicos agregados por zona** — el estrato se asigna al *inmueble*
  (Ley 142 de 1994), no a la persona, así que usado por zona no constituye
  tratamiento de dato personal.

Esto no es un detalle legal menor: la Ley 1581 de 2012 exige autorización previa,
expresa e informada, y en Colombia **no existe** la figura del interés legítimo
del RGPD. Enriquecer clientes identificados con sus redes sociales está fuera de
la ley, no solo fuera de lugar.

Cada dato enriquecido viaja con su procedencia y su nivel de confianza. Cuando
una zona no se resuelve, se dice; no se rellena. Y el agente tiene prohibido
afirmar nada que no esté en la tabla que recibe: si falta un dato, trabaja sin él.

## Cómo funciona

```
CSV → parseo → RFM ────┐
                       ├─→ agente (Claude) → plan → WhatsApp (Twilio)
     barrio → zona ────┘
```

| Módulo | Qué resuelve |
|---|---|
| `lib/ingesta/csv.ts` | CSV de Excel en español: separadores, BOM, montos y fechas locales, celulares a E.164 |
| `lib/data/bogota.ts` | Texto libre → localidad, con distancia de Levenshtein para erratas; estrato y población por zona |
| `lib/enriquecimiento/rfm.ts` | Segmentación por recencia, frecuencia y monto, con la razón en castellano llano |
| `lib/agente/planificador.ts` | El agente: salida estructurada por esquema JSON y razonamiento en streaming |
| `lib/whatsapp.ts` | Envío por Twilio, con los códigos de error traducidos a algo accionable |
| `app/api/procesar` | El pipeline entero servido como stream NDJSON, evento a evento |

Todo el enriquecimiento es local: los datos de Bogotá viven en el repositorio en
lugar de pedirse a un portal público en tiempo real. Son ~150 filas que no
cambian, y una llamada de red menos es un modo de fallo menos.

## Correrlo

```bash
npm install
cp .env.example .env   # y rellenar las claves
npm run dev
```

| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | El agente |
| `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` | Envío por WhatsApp |
| `TWILIO_WHATSAPP_FROM` | Número del sandbox, con el prefijo `whatsapp:` |
| `CHISPY_MODELO` | Modelo a usar (por defecto `claude-opus-5`) |

Sin credenciales de Twilio la aplicación funciona igual: el plan se genera y se
muestra, solo se desactiva el envío.

Hay una base de ejemplo en `public/ejemplo/` —una veterinaria de 40 clientes—
para probarlo sin datos propios.

## Stack

Next.js 16 · React 19 · Tailwind 4 · Claude · Twilio · TypeScript

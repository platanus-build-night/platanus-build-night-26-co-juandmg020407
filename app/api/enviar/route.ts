import { enviarWhatsapp, whatsappConfigurado } from "@/lib/whatsapp.ts";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ configurado: whatsappConfigurado() });
}

export async function POST(req: Request) {
  const { telefono, mensaje } = (await req.json()) as {
    telefono?: string;
    mensaje?: string;
  };

  if (!telefono || !mensaje) {
    return Response.json(
      { ok: false, motivo: "Falta el teléfono o el mensaje." },
      { status: 400 },
    );
  }

  const resultado = await enviarWhatsapp(telefono, mensaje);
  return Response.json(resultado, { status: resultado.ok ? 200 : 422 });
}

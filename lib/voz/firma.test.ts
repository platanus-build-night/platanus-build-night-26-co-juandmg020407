/**
 * Pruebas del portero de /api/voz.
 *
 * Lo que se comprueba aquí es exactamente lo que separa "el botón de la demo" de
 * "un sintetizador gratis para quien encuentre la URL".
 *
 * Se ejecuta con:  node --test lib/voz/firma.test.ts
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { firmar, firmaValida } from "./firma.ts";

const original = { ...process.env };

afterEach(() => {
  process.env.CHISPY_VOZ_SECRETO = original.CHISPY_VOZ_SECRETO;
  process.env.ELEVENLABS_API_KEY = original.ELEVENLABS_API_KEY;
});

test("firma y verifica el mismo texto", () => {
  process.env.CHISPY_VOZ_SECRETO = "secreto-de-prueba";

  const texto = "Revisé los 42 clientes de Veterinaria Huellitas.";
  const firma = firmar(texto);

  assert.ok(firma);
  assert.equal(firmaValida(texto, firma), true);
});

test("rechaza un texto alterado, aunque sea por un carácter", () => {
  process.env.CHISPY_VOZ_SECRETO = "secreto-de-prueba";

  const firma = firmar("Revisé los 42 clientes.")!;

  assert.equal(firmaValida("Revisé los 43 clientes.", firma), false);
});

test("rechaza firma vacía, basura o de otro largo", () => {
  process.env.CHISPY_VOZ_SECRETO = "secreto-de-prueba";

  const texto = "Cualquier cosa";

  assert.equal(firmaValida(texto, ""), false);
  assert.equal(firmaValida(texto, "deadbeef"), false);
  assert.equal(firmaValida(texto, "0".repeat(64)), false);
});

test("la firma cambia si cambia el secreto", () => {
  process.env.CHISPY_VOZ_SECRETO = "uno";
  const a = firmar("mismo texto");

  process.env.CHISPY_VOZ_SECRETO = "dos";
  const b = firmar("mismo texto");

  assert.notEqual(a, b);
});

test("sin ningún secreto no firma ni valida", () => {
  delete process.env.CHISPY_VOZ_SECRETO;
  delete process.env.ELEVENLABS_API_KEY;

  assert.equal(firmar("texto"), null);
  assert.equal(firmaValida("texto", "0".repeat(64)), false);
});

test("cae a la clave de ElevenLabs si no hay secreto propio", () => {
  delete process.env.CHISPY_VOZ_SECRETO;
  process.env.ELEVENLABS_API_KEY = "clave-de-prueba";

  const firma = firmar("texto");

  assert.ok(firma);
  assert.equal(firmaValida("texto", firma), true);
});

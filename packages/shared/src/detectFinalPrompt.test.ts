import { describe, expect, it } from "vitest";
import { detectFinalPrompt } from "./detectFinalPrompt";

const ENGLISH_PROMPT = [
  "A young woman standing in a sunlit studio, soft window light from the left,",
  "gentle shadows across her face, natural makeup, flowing linen dress in warm cream tones,",
  "shallow depth of field, 85mm portrait lens, photorealistic skin texture, fine detail in the hair,",
  "muted earthy background, subtle film grain, medium format quality, soft bokeh,",
  "relaxed natural pose, candid expression, warm color grade, high dynamic range, crisp focus on the eyes",
].join(" ");

const SPANISH_PROSE = [
  "La idea es un retrato fotorrealista de una mujer joven con luz suave de ventana,",
  "estilo documental, con ropa neutra de lino, fondo desenfocado, profundidad de campo reducida,",
  "tonos cálidos, grano de película sutil, calidad de cámara de formato medio,",
  "expresión natural y relajada, colores apagados, detalle fino en la piel y el cabello,",
  "composición equilibrada y armónica, sin filtros ni retoques excesivos, muy detallada,",
  "luz lateral suave y difusa, fondo neutro oscuro, estilo minimalista y elegante,",
  "mirada natural hacia la cámara, composición centrada, tono cálido y agradable",
].join(" ");

describe("detectFinalPrompt", () => {
  it("returns false for a Spanish interview question", () => {
    expect(detectFinalPrompt("¿Qué tipo de iluminación preferís para la sesión?")).toBe(false);
  });

  it("returns false for a multi-question Spanish interview reply", () => {
    expect(
      detectFinalPrompt("Buenas. ¿Qué estilo buscás? ¿Luz natural o artificial? ¿Preferís fondo neutro?"),
    ).toBe(false);
  });

  it("returns true for a complete English final prompt paragraph", () => {
    expect(detectFinalPrompt(ENGLISH_PROMPT)).toBe(true);
  });

  it("returns true for a pasted complete English prompt (passthrough)", () => {
    expect(detectFinalPrompt(`usá este: ${ENGLISH_PROMPT}`)).toBe(true);
  });

  it("returns false for a long Spanish paragraph without question marks", () => {
    expect(detectFinalPrompt(SPANISH_PROSE)).toBe(false);
  });

  it("returns false for empty or whitespace-only text", () => {
    expect(detectFinalPrompt("")).toBe(false);
    expect(detectFinalPrompt("   ")).toBe(false);
  });

  it("returns false for short text that is not a full prompt", () => {
    expect(detectFinalPrompt("A portrait")).toBe(false);
  });
});

import { CanvasTexture, NearestFilter } from "three";

const DEFAULT_GLYPH_CHARS = " .:-=+*#%@";

export interface CreateGlyphTextureOptions {
  charSize?: number;
}

/**
 * Creates a canvas texture atlas of glyphs (e.g. ASCII chars) for use as a sprite sheet.
 * Returns the texture and character count for UV indexing.
 */
export function createGlyphTexture(
  asciiChars: string,
  options: CreateGlyphTextureOptions = {}
): { texture: CanvasTexture; charCount: number } {
  const { charSize = 16 } = options;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return { texture: new CanvasTexture(document.createElement("canvas")), charCount: 1 };
  }

  const chars = asciiChars.length > 0 ? asciiChars : DEFAULT_GLYPH_CHARS;
  const charCount = chars.length;
  canvas.width = charSize * charCount;
  canvas.height = charSize;

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.font = `${charSize}px monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  chars.split("").forEach((char, i) => {
    ctx.fillText(char, (i + 0.5) * charSize, charSize / 2);
  });

  const texture = new CanvasTexture(canvas);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  return { texture, charCount };
}

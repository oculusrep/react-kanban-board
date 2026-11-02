// Oklahoma (Oculus brand heading font) for the tour PDF. Imported only by the lazy PDF
// export path: `?url` makes Vite emit each .ttf as a separate static asset, so the font is
// never part of a JS bundle and is only downloaded when someone exports a PDF.
// Font files: src/assets/fonts/ (from the brand package's "Oklahoma Font Support.zip";
// OS/2 fsType 0 = installable, so PDF embedding is permitted).
import regularUrl from '../assets/fonts/Oklahoma-Regular.ttf?url';
import boldUrl from '../assets/fonts/Oklahoma-Bold.ttf?url';

export interface PdfHeadingFont {
  regular: string; // base64 TTF
  bold: string;
}

async function base64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** null on failure — the PDF then falls back to Helvetica Bold for headings. */
export async function loadOklahoma(): Promise<PdfHeadingFont | null> {
  try {
    const [regular, bold] = await Promise.all([base64(regularUrl), base64(boldUrl)]);
    return { regular, bold };
  } catch {
    return null;
  }
}

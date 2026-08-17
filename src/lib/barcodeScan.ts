// Thin wrapper around zxing-wasm's reader — the app's only barcode decoder.
// Reader-only build (not /full), so the writer half never ships to the client.
//
// zxing-wasm's default locateFile() fetches the .wasm from a CDN (jsDelivr).
// That would (a) make the scanner useless offline, breaking the PWA's offline
// guarantee, and (b) add a third-party host the app doesn't otherwise talk to.
// Overriding locateFile to the Vite-bundled asset URL means the wasm ships in
// dist/assets/ and gets precached by Workbox exactly like sql.js's wasm already
// is (see db/sqlite.ts's sqlWasmUrl import — same ?url pattern, same reason).
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

prepareZXingModule({ overrides: { locateFile: () => wasmUrl } })

// Restrict to the retail formats a food product actually carries. Grocery
// barcodes are EAN-13 almost everywhere outside the US/Canada (UPC-A there,
// which EAN-13 already reads as a special case with a leading 0); EAN-8 and
// UPC-E are the truncated variants used on small packaging.
const FOOD_BARCODE_OPTIONS: ReaderOptions = {
  formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'],
  tryHarder: true,
  maxNumberOfSymbols: 1,
}

// Decodes a single frame/image and returns the barcode text, or null if none
// was found. Never throws for "nothing found" — only a genuinely broken input
// (corrupt image data) would reject, and callers treat that as "try again."
export async function scanBarcode(input: Blob | ImageData): Promise<string | null> {
  const results = await readBarcodes(input, FOOD_BARCODE_OPTIONS)
  const hit = results.find((r) => r.isValid && r.text)
  return hit?.text ?? null
}

// Downscale a captured photo to keep Claude vision calls small and fast.
export interface PreparedImage {
  base64: string // without the data: prefix
  dataUrl: string // for preview
  mediaType: 'image/jpeg'
  bytes: Uint8Array
}

export async function prepareImage(file: File, maxDim = 1280, quality = 0.82): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  const base64 = dataUrl.split(',')[1]
  return { base64, dataUrl, mediaType: 'image/jpeg', bytes: b64ToBytes(base64) }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      // fall through
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

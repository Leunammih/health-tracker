// Stable unique ids. crypto.randomUUID is available in Safari 15.4+ (our PWA target).
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback for very old engines
  return 'id-' + Math.abs(hashString(String(performance.now()) + navigator.userAgent)).toString(36)
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h
}

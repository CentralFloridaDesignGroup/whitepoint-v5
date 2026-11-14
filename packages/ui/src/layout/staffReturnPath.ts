export function safeStaffReturnPath(value: unknown, origin: string): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')
    || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null
  try {
    const target = new URL(value, origin)
    if (target.origin !== origin || /^\/login(?:[/?#]|$)/i.test(value) || /%2f|%5c/i.test(target.pathname)) return null
    return value
  } catch { return null }
}

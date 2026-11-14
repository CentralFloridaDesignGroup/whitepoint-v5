import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { requestJson } from '../../api/client'

export function DesktopConnect() {
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const label = params.get('installation_label') || ''
  const redirectUri = params.get('redirect_uri') || ''
  const valid = params.get('client_id') === 'northstar-desktop' && label.trim().length > 0 && label.length <= 80
    && !/[\u0000-\u001f\u007f]/.test(label) && params.get('code_challenge_method') === 'S256'
    && /^[A-Za-z0-9_-]{43}$/.test(params.get('code_challenge') || '')
    && /^[A-Za-z0-9_-]{32,128}$/.test(params.get('state') || '')
    && (() => { try { const url = new URL(redirectUri); return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '[::1]') && url.pathname === '/northstar/callback' && Boolean(url.port) && !url.username && !url.password && !url.search && !url.hash } catch { return false } })()
  const authorize = async () => {
    setBusy(true); setError('')
    try {
      const result = await requestJson<{ redirect_uri: string }>('/identity/native/authorize', {
        authMode: 'session', method: 'POST',
        body: JSON.stringify({ client_id: params.get('client_id'), redirect_uri: redirectUri, code_challenge: params.get('code_challenge'), code_challenge_method: params.get('code_challenge_method'), state: params.get('state'), installation_label: label }),
      })
      const target = new URL(result.redirect_uri)
      if (!valid || target.origin !== new URL(redirectUri).origin || target.pathname !== '/northstar/callback') throw new Error('The desktop callback was invalid.')
      window.location.assign(result.redirect_uri)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect Desktop.'); setBusy(false) }
  }
  return <main className="mx-auto max-w-xl space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <h1 className="text-2xl font-semibold">Connect Northstar Desktop</h1>
    {valid ? <>
      <p className="text-sm text-slate-700">Allow the Desktop installation <strong>{label}</strong> to use your White Point staff account on this Windows session?</p>
      <p className="rounded-lg bg-slate-100 p-3 text-sm">Check that <strong className="font-mono">{params.get('state')?.slice(0, 8).toUpperCase()}</strong> matches the code in Desktop.</p>
      <p className="text-sm text-slate-600">You can revoke this installation from My account. Continue only if you started sign-in in Desktop and the codes match.</p>
      <button type="button" disabled={busy} onClick={() => void authorize()} className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Connecting…' : 'Connect Desktop'}</button>
    </> : <p role="alert" className="text-sm text-red-800">This Desktop connection request is invalid. Start sign-in again from Desktop.</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </main>
}

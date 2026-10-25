import { useEffect, useState, type FormEvent } from 'react'
import { AuthenticatorQRCode, createPasskey } from '@whitepoint/ui/layout'
import { Button, OTPInput } from '@whitepoint/ui/input'
import { validPassword } from '@whitepoint/types/constants'
import { requestJson } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Card } from '../common/RecordControls'

type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null }
type SecurityStatus = { passwordSet: boolean; authenticatorEnabled: boolean; passkeys: Passkey[] }
type Setup = { secret: string; uri: string }
const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100'
const message = (error: unknown) => error instanceof Error ? error.message : 'The request failed.'
const when = (value: string | null) => value ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).toLocaleString() : 'Never'

export function MePage() {
  const auth = useAuth()
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [totpPassword, setTotpPassword] = useState('')
  const [setup, setSetup] = useState<Setup | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [passkeyPassword, setPasskeyPassword] = useState('')

  const refresh = async () => setStatus(await requestJson<SecurityStatus>('/identity/me/security', { authMode: 'session' }))
  useEffect(() => {
    void refresh().catch(cause => setError(message(cause)))
  }, [])
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (cause) { setError(message(cause)) } finally { setBusy(false) }
  }
  const changePassword = (event: FormEvent) => {
    event.preventDefault()
    if (!validPassword(newPassword)) { setError('New password does not meet the requirements.'); return }
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return }
    void run(async () => {
      await requestJson('/identity/me/password', { authMode: 'session', method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setNotice('Password changed. Other sessions have been signed out.')
    })
  }
  const startAuthenticator = () => void run(async () => {
    const result = await requestJson<Setup>('/identity/totp/start', { authMode: 'session', method: 'POST', body: JSON.stringify({ currentPassword: totpPassword }) })
    setTotpPassword(''); setCode(''); setRecoveryCodes([]); setSetup(result)
  })
  const confirmAuthenticator = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const result = await requestJson<{ recoveryCodes: string[] }>('/identity/totp/confirm', { authMode: 'session', method: 'POST', body: JSON.stringify({ code }) })
      setSetup(null); setCode(''); setRecoveryCodes(result.recoveryCodes)
      await refresh()
      setNotice('Authenticator updated. Save the new recovery codes; previous codes no longer work.')
    })
  }
  const addPasskey = () => void run(async () => {
    const options = await requestJson<{ challenge: string }>('/identity/passkey/register/options', { authMode: 'session', method: 'POST', body: JSON.stringify({ currentPassword: passkeyPassword }) })
    setPasskeyPassword('')
    const credential = await createPasskey(options as Parameters<typeof createPasskey>[0])
    await requestJson('/identity/passkey/register/verify', { authMode: 'session', method: 'POST', body: JSON.stringify({ challenge: options.challenge, response: credential }) })
    await refresh()
    setNotice('Passkey added. You can now remove an old passkey.')
  })
  const removePasskey = (id: string) => void run(async () => {
    await requestJson(`/identity/me/passkeys/${encodeURIComponent(id)}`, { authMode: 'session', method: 'DELETE', body: JSON.stringify({ currentPassword: passkeyPassword }) })
    setPasskeyPassword('')
    await refresh()
    setNotice('Passkey removed.')
  })

  return <main className="mx-auto max-w-4xl space-y-5 pb-10">
    <header><h1 className="text-3xl font-semibold text-slate-900">My account</h1><p className="mt-1 text-sm text-slate-600">{auth.userName} · {auth.userEmail}</p></header>
    <nav aria-label="Account sections" className="border-b border-slate-200 pb-3"><span aria-current="page" className="rounded-lg bg-sky-800 px-3 py-2 text-sm font-medium text-white">Security</span></nav>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!status && !error && <p>Loading account security…</p>}
    {status && <>
      <Card title="Password"><form onSubmit={changePassword} className="space-y-3">
        <p className="text-sm text-slate-600">{status.passwordSet ? 'A password is set for this account.' : 'No password is set for this account.'}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Current password<input className={inputClass} type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></label>
          <span className="hidden sm:block" />
          <label className="text-sm font-medium">New password<input className={inputClass} type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></label>
          <label className="text-sm font-medium">Confirm new password<input className={inputClass} type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label>
        </div>
        <p className="text-xs text-slate-600">Use 10–100 characters and at least three of: uppercase, lowercase, number, special character.</p>
        <Button type="submit" disabled={busy}>Change password</Button>
      </form></Card>
      <Card title="Authenticator app"><div className="space-y-4">
        <p className="text-sm text-slate-600">{status.authenticatorEnabled ? 'Your authenticator is active. A replacement becomes active only after you confirm its code.' : 'Set up an authenticator app.'}</p>
        {!setup && recoveryCodes.length === 0 && <div className="flex flex-wrap items-end gap-3"><label className="min-w-64 text-sm font-medium">Current password<input className={inputClass} type="password" autoComplete="current-password" value={totpPassword} onChange={event => setTotpPassword(event.target.value)} /></label><Button onClick={startAuthenticator} disabled={busy || !totpPassword}>{status.authenticatorEnabled ? 'Replace authenticator' : 'Set up authenticator'}</Button></div>}
        {setup && <form onSubmit={confirmAuthenticator} className="space-y-4"><p className="text-sm">Scan this QR code or enter the setup key, then confirm a code from your app.</p><AuthenticatorQRCode uri={setup.uri} /><div className="max-w-md rounded bg-slate-50 p-3 font-mono text-sm break-all">{setup.secret}</div><OTPInput label="Verification code" value={code} onChange={setCode} /><div className="flex gap-3"><Button type="submit" disabled={busy || code.length !== 6}>Confirm authenticator</Button><Button type="button" variant="secondary" onClick={() => { setSetup(null); setCode('') }} disabled={busy}>Cancel</Button></div></form>}
        {recoveryCodes.length > 0 && <div><h3 className="font-semibold">Save your new recovery codes</h3><p className="text-sm text-slate-600">Each code works once. Store them securely; they will not be shown again.</p><ul className="my-3 grid gap-2 font-mono text-sm sm:grid-cols-2">{recoveryCodes.map(value => <li key={value} className="rounded bg-slate-50 p-2">{value}</li>)}</ul><Button onClick={() => setRecoveryCodes([])}>I saved these codes</Button></div>}
      </div></Card>
      <Card title="Passkeys"><div className="space-y-4"><p className="text-sm text-slate-600">Add a new passkey before removing an old one. Passkeys are optional.</p>
        <div className="flex flex-wrap items-end gap-3"><label className="min-w-64 text-sm font-medium">Current password<input className={inputClass} type="password" autoComplete="current-password" value={passkeyPassword} onChange={event => setPasskeyPassword(event.target.value)} /></label><Button onClick={addPasskey} disabled={busy || !passkeyPassword}>Add passkey</Button></div>
        {status.passkeys.length ? <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">{status.passkeys.map(key => <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="font-medium">{key.name}</p><p className="text-xs text-slate-600">Added {when(key.createdAt)} · Last used {when(key.lastUsedAt)}</p></div><Button variant="secondary" disabled={busy || !passkeyPassword} onClick={() => removePasskey(key.id)}>Remove</Button></li>)}</ul> : <p className="text-sm text-slate-600">No passkeys registered.</p>}
      </div></Card>
    </>}
  </main>
}

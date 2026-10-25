import { startRegistration } from '@simplewebauthn/browser'
import { QRCodeSVG } from 'qrcode.react'

export function AuthenticatorQRCode({ uri }: { uri: string }) {
  return <QRCodeSVG value={uri} size={180} role="img" aria-label="Authenticator setup QR code" />
}

export function createPasskey(options: Parameters<typeof startRegistration>[0]['optionsJSON']) {
  return startRegistration({ optionsJSON: options })
}

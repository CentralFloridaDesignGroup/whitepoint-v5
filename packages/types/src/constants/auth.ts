/** The key used to store the request authentication context. */
export const REQUEST_AUTH_CONTEXT_KEY = '__wpsAuthContext__'

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 100
export const PASSWORD_MINIMUM_TYPES = 3

/** Character classes; a password must contain at least PASSWORD_MINIMUM_TYPES of them. */
export const PASSWORD_CHARACTER_TYPES = [
  { label: 'An uppercase character', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'A lowercase character', test: (p: string) => /[a-z]/.test(p) },
  { label: 'A special character ($, #, @, !, %, &)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  { label: 'A number', test: (p: string) => /[0-9]/.test(p) },
] as const

export function validPassword(password: string): boolean {
  const types = PASSWORD_CHARACTER_TYPES.filter((t) => t.test(password)).length
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    types >= PASSWORD_MINIMUM_TYPES
  )
}

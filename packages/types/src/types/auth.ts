// #region Requests

/** 
 * Represents the authentication mode for a request.
 * - `public`: No authentication required.
 * - `session`: Self-hosted staff session.
 */
export type AuthMode = 'public' | 'session'

/** Represents the authentication context for a request. */
export type AuthContext = {
    /** The authentication mode for the request. */
    mode: AuthMode
    /** The subject (user id) of the authentication context. */
    subject?: string
    /** The email of the authenticated user. */
    email?: string
    /** Internal user record. */
    internalUserId?: string
    /** Permissions loaded from the internal role record. */
    permissions?: string[]
}


// #endregion

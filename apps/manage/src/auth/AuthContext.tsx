import type { ReactNode } from 'react'
import { StaffAuthProvider, StaffProtectedRoutes, useStaffAuth } from '@whitepoint/ui/layout'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (location.hostname === 'localhost' ? 'http://localhost:8787/v5' : 'https://api.whitepointsurvey.com/v5')
export function AuthProvider({ children }: { children: ReactNode }) { return <StaffAuthProvider apiBaseUrl={apiBaseUrl}>{children}</StaffAuthProvider> }
export const ProtectedRoutes = StaffProtectedRoutes
export const useAuth = useStaffAuth

import type { ReactNode } from 'react'
import { StaffAuthProvider, StaffProtectedRoutes, useStaffAuth } from '@whitepoint/ui/layout'
import { apiBaseUrl } from '../api/client'

export function AuthProvider({ children }: { children: ReactNode }) { return <StaffAuthProvider apiBaseUrl={apiBaseUrl}>{children}</StaffAuthProvider> }
export const ProtectedRoutes = StaffProtectedRoutes
export const useAuth = useStaffAuth

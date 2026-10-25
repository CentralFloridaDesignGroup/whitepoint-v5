// Layout components
// Add shared layout components here

export { CommonLayout } from './commonLayout'
export { 
    NotificationCard, 
    closeNotification, 
    showNotification 
} from "./notificationCard";
export { Modal } from "./modal";
export { LoadingSpinner } from './loadingSpinner'
export type { LoadingSpinnerProps } from './loadingSpinner'
export { WorkInProgressComponent } from "./workInProgressComponent";
export { GisDisclaimer } from './gisDisclaimer'
export { OutletProvider, useSidebarContext } from './outletContext'
export { StaffAuthProvider, StaffProtectedRoutes, StaffLogin, useStaffAuth } from './staffAuth'
export { AuthenticatorQRCode, createPasskey } from './accountSecurity'
export { AuthPrompt } from './authPrompt'
export type { AuthPromptProps } from './authPrompt'
export { NotFoundPage, RouteErrorPage } from './errorPages'
export type { OutletContextType, SidebarDividerItem, SidebarHeaderItem, SidebarItem, SidebarLinkItem, SidebarProgressGroup } from './outletContext'

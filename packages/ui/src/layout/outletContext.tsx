import { createContext, useContext, useState, type ReactNode } from 'react'

export type OutletContextType = {
  sidebarItems: SidebarItem[]
  setSidebarItems: (items: SidebarItem[]) => void
}

interface SidebarItemBase { label: string | React.ReactNode }

export interface SidebarLinkItem extends SidebarItemBase {
  type: 'link'
  href: string
  icon?: React.ReactNode
  onClick?: () => void
  display?: 'text' | 'card'
}

export interface SidebarHeaderItem extends SidebarItemBase {
  type: 'header'
  icon?: React.ReactNode
}

export interface SidebarDividerItem extends SidebarItemBase { type: 'divider' }

export interface SidebarProgressGroup extends SidebarItemBase {
  type: 'progress'
  currentId: string | number
  sectionDisplay: string
  items: { id: string; label: string | React.ReactNode; disabled?: boolean; onClick: () => void; icon?: React.ReactNode }[]
}

export type SidebarItem = SidebarLinkItem | SidebarHeaderItem | SidebarDividerItem | SidebarProgressGroup

const OutletContext = createContext<OutletContextType | undefined>(undefined)

export function OutletProvider({ children }: { children: ReactNode }) {
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([])
  return <OutletContext.Provider value={{ sidebarItems, setSidebarItems }}>{children}</OutletContext.Provider>
}

export function useSidebarContext() {
  const context = useContext(OutletContext)
  if (!context) throw new Error('useSidebarContext must be used within an OutletProvider')
  return context
}

import { createContext, useContext, useLayoutEffect, type DependencyList, type ReactNode } from 'react'

/**
 * Lets a route push a small action button into the shared TopBar (rendered
 * by AppShell, a sibling of the route via <Outlet/>, so it can't just take
 * the button as a prop/child). AppShell provides the setter; a route calls
 * useHeaderAction and cleans up after itself on unmount/route change.
 */
export const HeaderActionSetterContext = createContext<(node: ReactNode) => void>(() => {})

export function useHeaderAction(node: ReactNode, deps: DependencyList) {
  const setHeaderAction = useContext(HeaderActionSetterContext)
  useLayoutEffect(() => {
    setHeaderAction(node)
    return () => setHeaderAction(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

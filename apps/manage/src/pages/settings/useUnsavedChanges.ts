import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

export function useUnsavedChanges(dirty: boolean) {
  const allowNextNavigation = useRef(false);
  const blocker = useBlocker(() => dirty && !allowNextNavigation.current);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Discard unsaved changes and leave this page?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  return () => { allowNextNavigation.current = true; };
}

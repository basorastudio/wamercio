'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type NavigateOptions = { replace?: boolean };
type NavigationContextValue = {
  pathname: string;
  navigate: (to: string | number, options?: NavigateOptions) => void;
};

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

const normalizePath = (value?: string) => {
  const raw = String(value || '/').trim() || '/';
  const withoutHash = raw.startsWith('#') ? raw.slice(1) : raw;
  const clean = withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`;
  return clean.replace(/\/+/g, '/');
};

const readHashPath = () => {
  if (typeof window === 'undefined') return '/';
  return normalizePath(window.location.hash.replace(/^#/, '') || '/');
};

export const NavigationProvider = ({ children }: { children: React.ReactNode }) => {
  const [pathname, setPathname] = useState('/');

  useEffect(() => {
    const sync = () => setPathname(readHashPath());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const navigate = useCallback((to: string | number, options: NavigateOptions = {}) => {
    if (typeof window === 'undefined') return;

    if (typeof to === 'number') {
      window.history.go(to);
      setPathname(readHashPath());
      return;
    }

    const nextPath = normalizePath(to);
    const nextHash = `#${nextPath}`;

    if (options.replace) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
      setPathname(nextPath);
      return;
    }

    if (window.location.hash === nextHash) {
      setPathname(nextPath);
      return;
    }

    window.location.hash = nextPath;
  }, []);

  const value = useMemo(() => ({ pathname, navigate }), [pathname, navigate]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigate = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigate debe usarse dentro de NavigationProvider');
  return context.navigate;
};

export const useLocation = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useLocation debe usarse dentro de NavigationProvider');
  return { pathname: context.pathname, search: '', hash: '' };
};

export const Link = ({ to, onClick, children, ...props }: LinkProps) => {
  const navigate = useNavigate();
  const href = `#${normalizePath(to)}`;

  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
};

export const Navigate = ({ to, replace = false }: { to: string; replace?: boolean }) => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, replace, to]);

  return null;
};

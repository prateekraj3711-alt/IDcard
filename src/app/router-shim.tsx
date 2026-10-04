// Thin adapter so the ported dashboard pages (written for react-router) run on TanStack Router.
import { forwardRef, type AnchorHTMLAttributes } from 'react';
import {
  Link as TLink, Outlet, useNavigate as useTNavigate, useParams as useTParams, useLocation as useTLocation,
} from '@tanstack/react-router';

export { Outlet };

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, replace, ...rest }, ref) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <TLink ref={ref} to={to as any} replace={replace} {...(rest as any)} />;
});

export function useNavigate() {
  const nav = useTNavigate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (to: string, opts?: { replace?: boolean; search?: Record<string, unknown> }) =>
    nav({ to: to as any, replace: opts?.replace, search: opts?.search as any });
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): Partial<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (useTParams as any)({ strict: false }) as Partial<T>;
}

export function useLocation() {
  return useTLocation();
}

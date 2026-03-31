import * as React from "react";
import * as RouterDom from "react-router-dom";
import type { NavigateOptions, To } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  normalizeCompanyPrefix,
} from "@/lib/company-routes";

function resolveTo(to: To, companyPrefix: string | null): To {
  if (typeof to === "string") {
    return applyCompanyPrefix(to, companyPrefix);
  }

  if (to.pathname && to.pathname.startsWith("/")) {
    const pathname = applyCompanyPrefix(to.pathname, companyPrefix);
    if (pathname !== to.pathname) {
      return { ...to, pathname };
    }
  }

  return to;
}

function useActiveCompanyPrefix(): string | null {
  const { selectedCompany } = useCompany();
  const params = RouterDom.useParams<{ companyPrefix?: string }>();
  const location = RouterDom.useLocation();

  if (params.companyPrefix) {
    return normalizeCompanyPrefix(params.companyPrefix);
  }

  const pathPrefix = extractCompanyPrefixFromPath(location.pathname);
  if (pathPrefix) return pathPrefix;

  return selectedCompany ? normalizeCompanyPrefix(selectedCompany.issuePrefix) : null;
}

export * from "react-router-dom";

export const Link = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.Link>>(
  function CompanyLink({ to, ...props }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    return <RouterDom.Link ref={ref} to={resolveTo(to, companyPrefix)} {...props} />;
  },
);

export const NavLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.NavLink>>(
  function CompanyNavLink({ to, ...props }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    return <RouterDom.NavLink ref={ref} to={resolveTo(to, companyPrefix)} {...props} />;
  },
);

export function Navigate({ to, ...props }: React.ComponentProps<typeof RouterDom.Navigate>) {
  // Use ref to stabilize prefix resolution — avoids infinite re-render loops
  // when company context changes trigger Navigate to re-resolve with a different prefix.
  const companyPrefix = useActiveCompanyPrefix();
  const prefixRef = React.useRef(companyPrefix);
  prefixRef.current = companyPrefix;
  const resolved = React.useMemo(() => resolveTo(to, prefixRef.current), [to]);
  return <RouterDom.Navigate to={resolved} {...props} />;
}

export function useNavigate(): ReturnType<typeof RouterDom.useNavigate> {
  const navigate = RouterDom.useNavigate();
  const companyPrefix = useActiveCompanyPrefix();

  // Use refs to keep the callback identity stable across re-renders.
  // This prevents infinite loops when navigate is used in useEffect dependency arrays,
  // since companyPrefix changes trigger a new callback which re-fires effects.
  const navigateRef = React.useRef(navigate);
  navigateRef.current = navigate;
  const prefixRef = React.useRef(companyPrefix);
  prefixRef.current = companyPrefix;

  return React.useCallback(
    ((to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        navigateRef.current(to);
        return;
      }
      navigateRef.current(resolveTo(to, prefixRef.current), options);
    }) as ReturnType<typeof RouterDom.useNavigate>,
    [],
  );
}

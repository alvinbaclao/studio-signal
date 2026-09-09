import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const BREAKPOINT = "(min-width: 900px)"; // matches Shell.css's own 900px rail/bottom-nav crossover
const FORCE_DESKTOP_KEY = "force-desktop-console";

interface ViewportState {
  /** True at >=900px width, or when the Director has chosen "Switch to
   *  full console" (Task 25) on a narrower physical viewport. Route-level
   *  components (DirectorHome vs DirectorHomeMobile, TeamsIndex vs
   *  DirectorTeamsMobile) key off this — Shell.tsx's own rail-vs-bottom-nav
   *  choice is CSS-driven (Shell.css's `.force-desktop` class), kept in
   *  sync via forceDesktop below rather than duplicating the media query
   *  in JS. */
  isDesktop: boolean;
  /** The real >=900px media query, ignoring forceDesktop — lets a caller
   *  (Shell's own "Switch to mobile view") tell "genuinely wide" apart
   *  from "narrow but forced," which `isDesktop` alone can't distinguish. */
  physicalDesktop: boolean;
  forceDesktop: boolean;
  setForceDesktop: (value: boolean) => void;
}

const ViewportContext = createContext<ViewportState | null>(null);

export function ViewportProvider({ children }: { children: ReactNode }) {
  const [matchesWidth, setMatchesWidth] = useState(() => window.matchMedia(BREAKPOINT).matches);
  const [forceDesktop, setForceDesktopState] = useState(() => sessionStorage.getItem(FORCE_DESKTOP_KEY) === "1");

  useEffect(() => {
    const mql = window.matchMedia(BREAKPOINT);
    const onChange = (e: MediaQueryListEvent) => setMatchesWidth(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const setForceDesktop = (value: boolean) => {
    if (value) sessionStorage.setItem(FORCE_DESKTOP_KEY, "1");
    else sessionStorage.removeItem(FORCE_DESKTOP_KEY);
    setForceDesktopState(value);
  };

  return (
    <ViewportContext.Provider value={{ isDesktop: matchesWidth || forceDesktop, physicalDesktop: matchesWidth, forceDesktop, setForceDesktop }}>
      {children}
    </ViewportContext.Provider>
  );
}

export function useViewport() {
  const ctx = useContext(ViewportContext);
  if (!ctx) throw new Error("useViewport must be used inside <ViewportProvider>");
  return ctx;
}

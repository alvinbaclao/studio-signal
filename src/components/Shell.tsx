import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import "./Shell.css";
import { supabase } from "../lib/supabase";
import { useAuth, hasRole } from "../lib/AuthProvider";
import { Avatar } from "./Avatar";
import {
  HomeIcon,
  ScheduleIcon,
  MessagingIcon,
  ProfileIcon,
  ConsoleIcon,
} from "./icons";

const primaryNavItems = [
  { to: "/", label: "Home", Icon: HomeIcon, end: true },
  { to: "/schedule", label: "Schedule", Icon: ScheduleIcon, end: false },
  { to: "/messages", label: "Messaging", Icon: MessagingIcon, end: false },
  { to: "/profile", label: "Profile", Icon: ProfileIcon, end: false },
] as const;

function navClass(base: string) {
  return ({ isActive }: { isActive: boolean }) =>
    isActive ? `${base} on` : base;
}

// The real responsive shell: a phone bottom nav below 900px, a dark left
// rail (plus a Director-only 5th item) at 900px and up. Each destination's
// own Home/Schedule/Bulletin/Media/Essentials sub-nav is built alongside
// the destinations themselves (Task 8/9/15), not here — there's nothing to
// route to yet. See docs/BUILD_PLAN.md Task 2.
export function Shell({ children }: { children: ReactNode }) {
  const { person } = useAuth();
  const isDirector = hasRole(person, "director");
  const [studioName, setStudioName] = useState<string | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    supabase
      .from("studio")
      .select("name")
      .eq("id", person.studio_id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setStudioName(data.name);
      });
    return () => {
      cancelled = true;
    };
  }, [person]);

  return (
    <div className="shell">
      <nav className="shell-rail" aria-label="Primary">
        <div className="shell-rail-brand">
          <span className="shell-rail-dot" />
          <span className="shell-rail-name">{studioName ?? "Studio"}</span>
        </div>

        {primaryNavItems.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navClass("shell-railitem")}>
            <Icon className="shell-icon" />
            {label}
          </NavLink>
        ))}

        {isDirector && (
          <NavLink to="/director" className={navClass("shell-railitem")}>
            <ConsoleIcon className="shell-icon" />
            Director console
          </NavLink>
        )}

        <div className="shell-rail-spacer" />

        {person && (
          <div className="shell-rail-account">
            <Avatar name={person.full_name} tone="band" size={32} />
            <div style={{ minWidth: 0 }}>
              <div className="shell-rail-account-name">{person.full_name}</div>
              <div className="shell-rail-account-role">
                {isDirector ? "Director" : titleCase(person.roles[0] ?? "")}
              </div>
            </div>
          </div>
        )}
      </nav>

      <div className="shell-content">{children}</div>

      <nav className="shell-bottom-nav" aria-label="Primary">
        {primaryNavItems.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={navClass("shell-navitem")}>
            <Icon className="shell-icon" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

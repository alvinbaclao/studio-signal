import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

// Paths ported from design-reference/HomeUnified.dc.html's bottom nav and
// DirectorConsole.dc.html's rail, so the primary nav icons match the canvas
// exactly at both breakpoints.

export function HomeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}

export function ScheduleIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </svg>
  );
}

export function MessagingIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0121 11.5z" />
    </svg>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" />
    </svg>
  );
}

// Director-only rail item, path ported from design-reference/DirectorRoster.dc.html's
// rail "Roster" glyph.
export function RosterIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2 20a7 7 0 0114 0M17 11a3 3 0 100-6M22 20a5.5 5.5 0 00-4-5.3" />
    </svg>
  );
}

// Director-only rail item, path ported from design-reference/DirectorHome.dc.html
// and JoinCodeManagement.dc.html's rail "Settings" glyph.
export function SettingsIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 006.6 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 13.9H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 8.6l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0110 4.6V3a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
    </svg>
  );
}

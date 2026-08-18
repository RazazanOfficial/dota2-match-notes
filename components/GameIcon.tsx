import type { SVGProps } from "react";

export type GameIconName =
  | "gold"
  | "xp"
  | "kda"
  | "clock"
  | "mode"
  | "damage"
  | "player"
  | "coach"
  | "journal"
  | "report";

interface GameIconProps extends SVGProps<SVGSVGElement> {
  name: GameIconName;
}

export function GameIcon({ name, className = "", ...props }: GameIconProps) {
  const common = {
    className: `game-icon ${className}`.trim(),
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
    ...props,
  };

  switch (name) {
    case "gold":
      return (
        <svg {...common}>
          <path d="M12 3.2 19 7v8l-7 5.8L5 15V7l7-3.8Z" fill="currentColor" opacity=".18" />
          <path d="M12 3.2 19 7v8l-7 5.8L5 15V7l7-3.8Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15.7 9.4a4.2 4.2 0 1 0 .1 5.1h-3.5v-2h5.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
        </svg>
      );
    case "xp":
      return (
        <svg {...common}>
          <path d="m12 2.8 2.3 5.5 5.9.5-4.5 3.9 1.4 5.8-5.1-3.1-5.1 3.1 1.4-5.8-4.5-3.9 5.9-.5L12 2.8Z" fill="currentColor" opacity=".18" />
          <path d="m12 2.8 2.3 5.5 5.9.5-4.5 3.9 1.4 5.8-5.1-3.1-5.1 3.1 1.4-5.8-4.5-3.9 5.9-.5L12 2.8Z" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "kda":
      return (
        <svg {...common}>
          <path d="m5 4 14 16M19 4 5 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
          <path d="m4 3 3 1-2 2-1-3Zm16 0-3 1 2 2 1-3ZM4 21l3-1-2-2-1 3Zm16 0-3-1 2-2 1 3Z" fill="currentColor" />
          <circle cx="12" cy="12" r="3" fill="currentColor" opacity=".22" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <path d="M12 4a8 8 0 1 1-5.7 2.4" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7v5l3.2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
          <path d="M4 4v4h4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "mode":
      return (
        <svg {...common}>
          <path d="M4 5h7l2 3h7v10H4V5Z" fill="currentColor" opacity=".16" />
          <path d="M4 5h7l2 3h7v10H4V5Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 11h8M8 14h5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "damage":
      return (
        <svg {...common}>
          <path d="m13.2 2.8-7 10.1h4.7L9.8 21l8-11.2h-4.9l.3-7Z" fill="currentColor" opacity=".2" />
          <path d="m13.2 2.8-7 10.1h4.7L9.8 21l8-11.2h-4.9l.3-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="bevel" />
        </svg>
      );
    case "player":
      return (
        <svg {...common}>
          <path d="M12 3 5.5 6v5.2c0 4.2 2.6 7.7 6.5 9.8 3.9-2.1 6.5-5.6 6.5-9.8V6L12 3Z" fill="currentColor" opacity=".16" />
          <path d="M12 3 5.5 6v5.2c0 4.2 2.6 7.7 6.5 9.8 3.9-2.1 6.5-5.6 6.5-9.8V6L12 3Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="m9 13 2 2 4-5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "coach":
      return (
        <svg {...common}>
          <path d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5Z" fill="currentColor" opacity=".14" />
          <path d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5Z" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "journal":
      return (
        <svg {...common}>
          <path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11H8a3 3 0 0 1-3-3V4.5Z" fill="currentColor" opacity=".14" />
          <path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11H8a3 3 0 0 1-3-3V4.5Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 8h7M8 12h7M8 16h4" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    case "report":
      return (
        <svg {...common}>
          <path d="M5 19V9m5 10V5m5 14v-7m4 7V3" stroke="currentColor" strokeWidth="2" />
          <path d="M3 20h18" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
  }
}

export function GameMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`game-mark ${className}`.trim()}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8 7h48v50H8V7Z" fill="currentColor" opacity=".11" />
      <path d="M8 7h48v50H8V7Z" stroke="currentColor" strokeWidth="2" />
      <path d="m14 13 15 5-5 8-10-13Zm36 0-15 5 5 8 10-13ZM14 51l15-5-5-8-10 13Zm36 0-15-5 5-8 10 13Z" fill="currentColor" />
      <path d="M27 27h10v10H27V27Z" fill="currentColor" opacity=".55" />
    </svg>
  );
}

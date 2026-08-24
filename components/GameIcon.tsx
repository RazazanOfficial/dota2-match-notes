import type { LucideProps } from "lucide-react";
import {
  ChartNoAxesCombined,
  Clock3,
  Coins,
  Eye,
  Gamepad2,
  Gem,
  NotebookTabs,
  ShieldCheck,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react";

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

interface GameIconProps extends LucideProps {
  name: GameIconName;
}

const ICONS = {
  gold: Coins,
  xp: Sparkles,
  kda: Swords,
  clock: Clock3,
  mode: Gamepad2,
  damage: Zap,
  player: ShieldCheck,
  coach: Eye,
  journal: NotebookTabs,
  report: ChartNoAxesCombined,
} satisfies Record<GameIconName, typeof Coins>;

export function GameIcon({ name, className = "", ...props }: GameIconProps) {
  const Icon = ICONS[name];
  return (
    <Icon
      className={`game-icon ${className}`.trim()}
      aria-hidden="true"
      strokeWidth={1.7}
      {...props}
    />
  );
}

export function GameMark({ className = "" }: { className?: string }) {
  return <Gem className={`game-mark ${className}`.trim()} aria-hidden="true" />;
}

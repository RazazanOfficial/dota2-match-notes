"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  Coins,
  Copy,
  Crosshair,
  Gem,
  HeartPulse,
  ListChecks,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";
import { toast } from "react-toastify";
import { heroById, heroImage } from "@/data/heroes";
import { roleLabel } from "@/lib/constants";
import type { DotaTeam, Match, MatchParticipant } from "@/lib/types";
import MatchInventory from "./MatchInventory";

interface MatchScoreboardProps {
  match: Match;
}

export default function MatchScoreboard({ match }: MatchScoreboardProps) {
  const participants = match.participants || [];
  const profilePlayer = useMemo(
    () => participants.find((participant) => participant.isProfilePlayer)
      || participants.find((participant) => participant.heroId === match.heroId)
      || participants[0]
      || null,
    [match.heroId, participants],
  );
  const [selectedSlot, setSelectedSlot] = useState<number | null>(
    profilePlayer?.playerSlot ?? null,
  );
  const [copiedMatchId, setCopiedMatchId] = useState(false);

  useEffect(() => {
    setSelectedSlot(profilePlayer?.playerSlot ?? null);
  }, [match.id, profilePlayer?.playerSlot]);

  useEffect(() => {
    if (!copiedMatchId) return;
    const timer = window.setTimeout(() => setCopiedMatchId(false), 1_600);
    return () => window.clearTimeout(timer);
  }, [copiedMatchId]);

  const selected = participants.find((participant) => participant.playerSlot === selectedSlot)
    || profilePlayer;
  const radiant = participants.filter((participant) => participant.team === "radiant");
  const dire = participants.filter((participant) => participant.team === "dire");
  const duration = formatDuration(match.durationSeconds);
  const winner = match.radiantWin === null || match.radiantWin === undefined
    ? null
    : match.radiantWin ? "radiant" : "dire";
  const matchType = [match.lobbyTypeName, match.gameModeName].filter(Boolean).join(" · ") || "—";

  async function copyMatchId() {
    if (!match.dotaMatchId) return;
    try {
      await navigator.clipboard.writeText(match.dotaMatchId);
      setCopiedMatchId(true);
      toast.success("شناسه مچ کپی شد");
    } catch {
      toast.error("کپی شناسه مچ انجام نشد");
    }
  }

  return (
    <section className="match-scoreboard" aria-label="جزئیات کامل مچ">
      <header className="match-result-strip">
        <div className={`match-winner is-radiant${winner === "radiant" ? " is-visible" : ""}`}>
          Radiant پیروز شد
        </div>
        <div className="match-result-chip is-id">
          <span lang="en" dir="ltr">Match ID</span>
          <strong lang="en" dir="ltr">{match.dotaMatchId || "—"}</strong>
          <button
            type="button"
            disabled={!match.dotaMatchId}
            onClick={copyMatchId}
            aria-label="کپی شناسه مچ"
            title="کپی شناسه مچ"
          >
            {copiedMatchId ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </button>
        </div>
        <div className="match-result-center">
          <span className="match-result-duration" lang="en" dir="ltr">{duration}</span>
          <div className="match-result-score" dir="ltr" aria-label="نتیجه مچ">
            <strong className="is-radiant">{formatNumber(match.radiantScore)}</strong>
            <span>—</span>
            <strong className="is-dire">{formatNumber(match.direScore)}</strong>
          </div>
        </div>
        <div className="match-result-chip is-type">
          <span>Match Type</span>
          <strong lang="en" dir="ltr">{matchType}</strong>
        </div>
        <div className={`match-winner is-dire${winner === "dire" ? " is-visible" : ""}`}>
          Dire پیروز شد
        </div>
      </header>

      <div className="match-team-grid">
        <TeamPanel
          team="radiant"
          participants={radiant}
          selectedSlot={selected?.playerSlot ?? null}
          onSelect={setSelectedSlot}
        />
        <TeamPanel
          team="dire"
          participants={dire}
          selectedSlot={selected?.playerSlot ?? null}
          onSelect={setSelectedSlot}
        />
      </div>

      {selected && <FocusedPlayer match={match} participant={selected} />}

      <section className="match-ban-strip" aria-label="بن‌های مچ">
        <header><span>بن‌های مچ</span></header>
        <div>
          {match.bans.length ? match.bans.map((ban) => (
            <span
              className={`match-ban-hero${ban.inRolePool ? " is-pool-priority" : ""}`}
              key={ban.id}
              title={ban.name}
            >
              <span><img src={heroImage(ban)} alt={ban.name} /></span>
              <b lang="en" dir="ltr">{ban.name}</b>
            </span>
          )) : <span className="match-ban-empty">—</span>}
        </div>
      </section>
    </section>
  );
}

function TeamPanel({
  team,
  participants,
  selectedSlot,
  onSelect,
}: {
  team: DotaTeam;
  participants: MatchParticipant[];
  selectedSlot: number | null;
  onSelect: (slot: number) => void;
}) {
  return (
    <section className={`match-team is-${team}`} aria-label={`تیم ${teamName(team)}`}>
      <header>
        <span className="match-team-identity">
          <img src={`/match-details/${team}.webp`} alt="" aria-hidden="true" />
          <strong lang="en">{teamName(team)}</strong>
        </span>
        <span>LVL</span>
        <span>K / D / A</span>
        <span className="match-team-networth-heading">
          Net Worth <GoldIcon />
        </span>
      </header>
      <div className="match-team-players">
        {participants.map((participant) => {
          const hero = heroById(participant.heroId);
          return (
            <button
              className={[
                "match-player-row",
                selectedSlot === participant.playerSlot ? "is-selected" : "",
                participant.isProfilePlayer ? "is-profile" : "",
                participant.inRolePool ? "is-pool-priority" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              key={participant.playerSlot}
              aria-pressed={selectedSlot === participant.playerSlot}
              onClick={() => onSelect(participant.playerSlot)}
            >
              <span className="match-player-identity">
                <span className="match-player-portrait">
                  {hero && <img src={heroImage(hero)} alt={participant.heroName} />}
                </span>
                <span className="match-player-name">
                  <strong lang="en" dir="ltr">{playerName(participant.personName)}</strong>
                  <small lang="en" dir="ltr">{participant.heroName}</small>
                </span>
              </span>
              <span className="match-player-level" lang="en">{formatNumber(participant.level)}</span>
              <span className="match-player-kda" lang="en" dir="ltr">
                {formatKda(participant)}
              </span>
              <span className="match-player-networth" lang="en" dir="ltr">
                {formatNumber(participant.netWorth, true)} <GoldIcon />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FocusedPlayer({ match, participant }: { match: Match; participant: MatchParticipant }) {
  const hero = heroById(participant.heroId);
  const won = match.radiantWin === null || match.radiantWin === undefined
    ? null
    : match.radiantWin === (participant.team === "radiant");
  const role = participant.isProfilePlayer && match.role ? roleLabel(match.role) : "";

  return (
    <section className={`match-player-focus is-${participant.team}`}>
      <div className="match-focus-hero">
        <span className="match-focus-portrait">
          {hero && <img src={heroImage(hero)} alt={participant.heroName} />}
        </span>
        <div>
          <strong lang="en" dir="ltr">{participant.heroName}</strong>
          {role && <span lang="en" dir="ltr">{role}</span>}
        </div>
      </div>

      <div className="match-focus-metrics">
        <FocusMetric icon={Swords} label="K / D / A" value={formatKda(participant)} />
        <FocusMetric icon={Coins} label="GPM" value={formatNumber(participant.goldPerMinute)} tone="gold" />
        <FocusMetric icon={Sparkles} label="XPM" value={formatNumber(participant.xpPerMinute)} tone="xp" />
        <FocusMetric icon={Gem} label="Net Worth" value={formatNumber(participant.netWorth, true)} tone="gold" gold />
        <FocusMetric icon={Crosshair} label="Hero Damage" value={formatNumber(participant.heroDamage, true)} tone="damage" />
        <FocusMetric icon={Building2} label="Tower Damage" value={formatNumber(participant.towerDamage, true)} tone="damage" />
        <FocusMetric icon={HeartPulse} label="Hero Healing" value={formatNumber(participant.heroHealing, true)} tone="healing" />
        <FocusMetric
          icon={ListChecks}
          label="LH / DN"
          value={`${formatNumber(participant.lastHits)} / ${formatNumber(participant.denies)}`}
        />
      </div>

      <div className="match-focus-inventory">
        <MatchInventory key={participant.playerSlot} participant={participant} />
      </div>
    </section>
  );
}

function FocusMetric({
  icon: Icon,
  label,
  value,
  tone = "",
  gold = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "" | "gold" | "xp" | "damage" | "healing";
  gold?: boolean;
}) {
  return (
    <span className={`match-focus-metric${tone ? ` is-${tone}` : ""}`}>
      <small lang="en"><Icon aria-hidden="true" />{label}</small>
      <strong lang="en" dir="ltr">{value}{gold && <GoldIcon />}</strong>
    </span>
  );
}

function GoldIcon() {
  return <img className="match-gold-icon" src="/match-details/gold.png" alt="" aria-hidden="true" />;
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatKda(participant: MatchParticipant) {
  return `${formatNumber(participant.kills)} / ${formatNumber(participant.deaths)} / ${formatNumber(participant.assists)}`;
}

function formatNumber(value?: number | null, grouped = false) {
  if (value === null || value === undefined) return "—";
  return grouped ? value.toLocaleString("en-US") : String(value);
}

function teamName(team: DotaTeam) {
  return team === "radiant" ? "Radiant" : "Dire";
}

function playerName(name: string) {
  return name === "بازیکن ناشناس" || !name.trim() ? "حساب خصوصی" : name;
}

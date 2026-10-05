"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { restorePlayer, saveDay } from "@/lib/api";
import { formatFullDate } from "@/lib/date";
import type { Day, Match } from "@/lib/types";
import MatchDialog from "./MatchDialog";

interface MatchDetailsPageProps {
  initialMatch: Match;
  initialDay: Day;
  dateKey: string;
  readonly: boolean;
  fallbackHref: string;
}

export default function MatchDetailsPage({
  initialMatch,
  initialDay,
  dateKey,
  readonly,
  fallbackHref,
}: MatchDetailsPageProps) {
  const router = useRouter();
  const [match, setMatch] = useState(initialMatch);
  const [day, setDay] = useState(initialDay);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  function leaveMatchPage() {
    const referrer = document.referrer;
    if (referrer && referrer.startsWith(window.location.origin) && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  async function saveMatch(nextMatch: Match) {
    if (readonly) return;
    setBusy(true);
    try {
      const session = await restorePlayer();
      if (!session) throw new Error("برای ذخیره تغییرات دوباره وارد حساب شوید");

      const nextDay = structuredClone(day);
      const index = nextDay.matches.findIndex((candidate) => candidate.id === nextMatch.id);
      if (index < 0) throw new Error("این مچ در دفتر شما پیدا نشد");
      nextDay.matches[index] = nextMatch;

      const savedProfile = await saveDay(session, dateKey, nextDay);
      const savedDay = savedProfile.days[dateKey];
      const savedMatch = savedDay?.matches.find((candidate) => candidate.id === nextMatch.id);
      if (!savedDay || !savedMatch) throw new Error("نسخه ذخیره‌شده مچ دریافت نشد");

      setDay(savedDay);
      setMatch(savedMatch);
      setRevision((value) => value + 1);
      toast.success("تغییرات مچ ذخیره شد");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت اطلاعات انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MatchDialog
      key={`${match.id}:${revision}`}
      open
      presentation="page"
      readonly={readonly}
      dateLabel={formatFullDate(new Date(`${dateKey}T00:00:00Z`))}
      match={match}
      nextNumber={day.matches.reduce((max, candidate) => Math.max(max, candidate.number), 0) + 1}
      busy={busy}
      onClose={leaveMatchPage}
      onSave={saveMatch}
    />
  );
}

"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ChevronLeft,
  LoaderCircle,
  Search,
  UserRound,
  UserRoundSearch,
  X,
} from "lucide-react";
import { searchPlayers } from "@/lib/api";
import type { PlayerSearchResult } from "@/lib/types";

const SEARCH_DELAY_MS = 280;
const MIN_QUERY_LENGTH = 2;

export default function PlayerSearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setLoading(false);
    setError("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const normalized = query.normalize("NFKC").trim();

    if (normalized.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      searchPlayers(normalized, controller.signal)
        .then(setResults)
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          setResults([]);
          setError(reason instanceof Error ? reason.message : "جست‌وجو انجام نشد");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const first = results[0];
    if (first) window.location.assign(`/user/${first.steamAccountId}`);
  }

  const normalizedLength = query.normalize("NFKC").trim().length;

  return (
    <div className="modal-backdrop player-search-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal player-search-modal"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-kicker" lang="en">PLAYER SEARCH</p>
            <h2>پیدا کردن بازیکن</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="بستن">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="player-search-hero">
          <UserRoundSearch aria-hidden="true" />
          <p>نام Steam، شناسه Dota2Notes، Account ID یا SteamID64 را بنویس.</p>
        </div>

        <label className="player-search-field">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            lang="en"
            dir="ltr"
            autoComplete="off"
            value={query}
            maxLength={64}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="نام یا شناسه بازیکن..."
          />
          {loading && <LoaderCircle className="player-search-spinner" aria-label="در حال جست‌وجو" />}
        </label>

        <div className="player-search-results" role="listbox" aria-label="نتایج جست‌وجو">
          {normalizedLength < MIN_QUERY_LENGTH ? (
            <p className="player-search-state">حداقل دو نویسه وارد کن.</p>
          ) : error ? (
            <p className="player-search-state is-error" role="alert">{error}</p>
          ) : !loading && results.length === 0 ? (
            <p className="player-search-state">بازیکنی با این نام یا شناسه پیدا نشد.</p>
          ) : (
            results.map((player) => (
              <a
                key={player.steamId}
                className="player-search-result"
                href={`/user/${player.steamAccountId}`}
                role="option"
                onClick={onClose}
              >
                <span className="player-search-avatar">
                  {player.avatarUrl ? (
                    <img src={player.avatarUrl} alt="" />
                  ) : (
                    <UserRound aria-hidden="true" />
                  )}
                </span>
                <span className="player-search-identity">
                  <strong>{player.displayName}</strong>
                  <small lang="en" dir="ltr">{player.handle}</small>
                </span>
                <span className="player-search-account" lang="en" dir="ltr">
                  ID {player.steamAccountId}
                </span>
                <ChevronLeft aria-hidden="true" />
              </a>
            ))
          )}
        </div>
      </form>
    </div>
  );
}

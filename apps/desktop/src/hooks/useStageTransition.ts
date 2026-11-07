import { motionAllowed } from "../experience";
import { useEffect, useRef, useState } from "react";
export const STEP_HOLD_MS = 450,
  STEP_CHECK_MS = 180;
export function useStageTransition(
  target: number,
  requestKey: string,
  immediate = false,
) {
  const [state, setState] = useState({
    key: requestKey,
    step: target,
    checking: false,
  });
  const latest = useRef(target);
  latest.current = target;
  const reduced = typeof window !== "undefined" && !motionAllowed();
  useEffect(() => {
    if (
      state.key !== requestKey ||
      target < state.step ||
      immediate ||
      reduced
    ) {
      setState({ key: requestKey, step: target, checking: false });
      return;
    }
    if (state.step >= target) return;
    const hold = window.setTimeout(
      () => setState((s) => ({ ...s, checking: true })),
      STEP_HOLD_MS,
    );
    const next = window.setTimeout(
      () =>
        setState((s) => ({
          ...s,
          step: Math.min(s.step + 1, latest.current),
          checking: false,
        })),
      STEP_HOLD_MS + STEP_CHECK_MS,
    );
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(next);
    };
  }, [target, requestKey, state.step, state.key, immediate, reduced]);
  return state.key !== requestKey || immediate || reduced
    ? { step: target, checking: false }
    : state;
}

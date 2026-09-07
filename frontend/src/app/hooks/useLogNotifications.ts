import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from "react";
import type { GameEvent } from "../../../../shared/src/types";
import { getNewGameEvents } from "../../game/engine";
import { formatStructuredKoActionNotice, type CoinFlipEvent, toCoinFlipEventFromGameEvent } from "../gameUiHelpers";

type UseLogNotificationsArgs = {
  gameLog: string[];
  gameEvents: GameEvent[] | undefined;
  isSetupPhase: boolean;
  actionNotice: string | null;
  activeCoinFlip: CoinFlipEvent | null;
  previousLogRef: MutableRefObject<string[]>;
  previousEventsRef: MutableRefObject<GameEvent[]>;
  coinFlipIdRef: MutableRefObject<number>;
  skipNextCoinLogMessageRef: MutableRefObject<Array<"heads" | "tails"> | null>;
  setActionNotice: Dispatch<SetStateAction<string | null>>;
  setCoinFlipQueue: Dispatch<SetStateAction<CoinFlipEvent[]>>;
  setActiveCoinFlip: Dispatch<SetStateAction<CoinFlipEvent | null>>;
  getNewLogEntries: (currentLog: string[], previousLog: string[]) => string[];
  getKoCauseFromEntries: (newEntries: string[], koEntry: string) => string | null;
  formatKoActionNotice: (koEntry: string, koCause: string | null) => string;
};

export function useLogNotifications({
  gameLog,
  gameEvents,
  isSetupPhase,
  actionNotice,
  activeCoinFlip,
  previousLogRef,
  previousEventsRef,
  coinFlipIdRef,
  skipNextCoinLogMessageRef,
  setActionNotice,
  setCoinFlipQueue,
  setActiveCoinFlip,
  getNewLogEntries,
  getKoCauseFromEntries,
  formatKoActionNotice,
}: UseLogNotificationsArgs): void {
  useEffect(() => {
    const previousLog = previousLogRef.current;
    const newEntries = getNewLogEntries(gameLog, previousLog);
    previousLogRef.current = gameLog;
    const newEvents = getNewGameEvents(previousEventsRef.current, gameEvents);
    previousEventsRef.current = gameEvents ?? [];

    const coinFlips = newEvents
      // Opening coin presentation is owned by useOpeningHandFlow so both PvP
      // peers animate the same authoritative setup event exactly once.
      .filter((event): event is Extract<GameEvent, { kind: "coin" }> => event.kind === "coin" && !isSetupPhase)
      .map((event) => toCoinFlipEventFromGameEvent(event, coinFlipIdRef.current++));
    const filteredCoinFlips = coinFlips.filter((event) => {
      const skipResults = skipNextCoinLogMessageRef.current;
      if (skipResults && skipResults.length === event.results?.length && skipResults.every((result, index) => result === event.results?.[index])) {
        skipNextCoinLogMessageRef.current = null;
        return false;
      }
      return true;
    });
    if (filteredCoinFlips.length > 0) {
      if (!activeCoinFlip) {
        const [nextFlip, ...restFlips] = filteredCoinFlips;
        if (nextFlip) setActiveCoinFlip(nextFlip);
        if (restFlips.length > 0) setCoinFlipQueue((queue) => [...queue, ...restFlips]);
      } else {
        setCoinFlipQueue((queue) => [...queue, ...filteredCoinFlips]);
      }
    }

    const knockoutEvent = newEvents.find((event): event is Extract<GameEvent, { kind: "knockout" }> => event.kind === "knockout");
    if (knockoutEvent) {
      setActionNotice(formatStructuredKoActionNotice(knockoutEvent));
      return;
    }

    const koEntry = newEntries.find((entry) => entry.includes("was knocked out"));
    if (koEntry) {
      setActionNotice(formatKoActionNotice(koEntry, getKoCauseFromEntries(newEntries, koEntry)));
      return;
    }

    if (actionNotice?.startsWith("KO |")) return;
  }, [
    gameLog,
    actionNotice,
    activeCoinFlip,
    previousLogRef,
    coinFlipIdRef,
    skipNextCoinLogMessageRef,
    setActionNotice,
    setCoinFlipQueue,
    setActiveCoinFlip,
    getNewLogEntries,
    getKoCauseFromEntries,
    formatKoActionNotice,
    gameEvents,
    isSetupPhase,
    previousEventsRef,
  ]);
}

import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from "react";
import type { CoinFlipEvent } from "../gameUiHelpers";

type UseLogNotificationsArgs = {
  gameLog: string[];
  actionNotice: string | null;
  activeCoinFlip: CoinFlipEvent | null;
  previousLogRef: MutableRefObject<string[]>;
  coinFlipIdRef: MutableRefObject<number>;
  skipNextCoinLogMessageRef: MutableRefObject<string | null>;
  setActionNotice: Dispatch<SetStateAction<string | null>>;
  setCoinFlipQueue: Dispatch<SetStateAction<CoinFlipEvent[]>>;
  setActiveCoinFlip: Dispatch<SetStateAction<CoinFlipEvent | null>>;
  setAcknowledgedCoinLogMessage: Dispatch<SetStateAction<string | null>>;
  toCoinFlipEvent: (entry: string, id: number) => CoinFlipEvent | null;
  getNewLogEntries: (currentLog: string[], previousLog: string[]) => string[];
  getKoCauseFromEntries: (newEntries: string[], koEntry: string) => string | null;
  formatKoActionNotice: (koEntry: string, koCause: string | null) => string;
};

export function useLogNotifications({
  gameLog,
  actionNotice,
  activeCoinFlip,
  previousLogRef,
  coinFlipIdRef,
  skipNextCoinLogMessageRef,
  setActionNotice,
  setCoinFlipQueue,
  setActiveCoinFlip,
  setAcknowledgedCoinLogMessage,
  toCoinFlipEvent,
  getNewLogEntries,
  getKoCauseFromEntries,
  formatKoActionNotice,
}: UseLogNotificationsArgs): void {
  useEffect(() => {
    const previousLog = previousLogRef.current;
    const newEntries = getNewLogEntries(gameLog, previousLog);
    previousLogRef.current = gameLog;
    if (newEntries.length === 0) return;

    const coinFlips = newEntries
      .map((entry) => toCoinFlipEvent(entry, coinFlipIdRef.current++))
      .filter((event): event is CoinFlipEvent => Boolean(event));
    const filteredCoinFlips = coinFlips.filter((event) => {
      const skipMessage = skipNextCoinLogMessageRef.current;
      if (skipMessage && event.message === skipMessage) {
        setAcknowledgedCoinLogMessage(event.message);
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

    const koEntry = newEntries.find((entry) => entry.includes("was knocked out"));
    if (koEntry) {
      const koCause = getKoCauseFromEntries(newEntries, koEntry);
      setActionNotice(formatKoActionNotice(koEntry, koCause));
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
    setAcknowledgedCoinLogMessage,
    toCoinFlipEvent,
    getNewLogEntries,
    getKoCauseFromEntries,
    formatKoActionNotice,
  ]);
}

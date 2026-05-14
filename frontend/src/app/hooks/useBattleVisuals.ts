import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CardFlowItem } from "../../match/feedback/CardFlowOverlay";
import type { BattleEffectEvent } from "../../match/feedback/BattleEffectOverlay";
import type { GameState, SideId, UmamusumeInstance } from "../../../../shared/src/types";
import {
  ACTIVE_PROMOTION_REVEAL_MS,
  KO_ACTIVE_VACANCY_MS,
  KO_DISSOLVE_MS,
} from "../constants";
import {
  buildBattleEffects,
  cloneBattleEffectBoardSnapshot,
  cloneBattleSnapshotUmamusume,
  createBattleSnapshot,
  getLeadingBattleEffectBatch,
  withKoVacantActive,
  withRetainedKoBoard,
  type KoRetainedBoardBySide,
  type PointGainEvent,
  type VisualAttachedEnergyByUid,
  type VisualHpByUid,
} from "../animation";

type UseBattleVisualsArgs = {
  baseDisplayGame: GameState;
  isCoinFlipBlocking: boolean;
  activeCoinFlip: unknown;
  cardFlowQueue: CardFlowItem[][];
  pendingPlayerChoice: GameState["pendingPlayerChoice"];
};

export function useBattleVisuals({
  baseDisplayGame,
  isCoinFlipBlocking,
  activeCoinFlip,
  cardFlowQueue,
  pendingPlayerChoice,
}: UseBattleVisualsArgs) {
  const [battleEffectQueue, setBattleEffectQueue] = useState<BattleEffectEvent[]>([]);
  const [koCrumblingUids, setKoCrumblingUids] = useState<Set<number>>(new Set());
  const [koRetainedActiveBySide, setKoRetainedActiveBySide] = useState<Partial<Record<SideId, UmamusumeInstance>>>({});
  const [koRetainedBoardBySide, setKoRetainedBoardBySide] = useState<KoRetainedBoardBySide>({});
  const [koVacancyBySide, setKoVacancyBySide] = useState<Partial<Record<SideId, boolean>>>({});
  const [koPromotionLockedBySide, setKoPromotionLockedBySide] = useState<Partial<Record<SideId, boolean>>>({});
  const [activePromotionRevealingBySide, setActivePromotionRevealingBySide] = useState<Partial<Record<SideId, boolean>>>({});
  const [pointGainQueue, setPointGainQueue] = useState<PointGainEvent[]>([]);
  const [scorePointsOverrideBySide, setScorePointsOverrideBySide] = useState<Partial<Record<SideId, number>>>({});
  const [visualHpByUid, setVisualHpByUid] = useState<VisualHpByUid>({});
  const [visualAttachedEnergyByUid, setVisualAttachedEnergyByUid] = useState<VisualAttachedEnergyByUid>({});

  const previousBattleSnapshotRef = useRef<ReturnType<typeof createBattleSnapshot> | null>(null);
  const battleEffectIdRef = useRef(1);
  const pointGainIdRef = useRef(1);
  const pendingKoPromotionReleaseSidesRef = useRef<SideId[]>([]);
  const koVacancyTimeoutBySideRef = useRef<Partial<Record<SideId, number>>>({});
  const koCrumbleTimeoutIdsRef = useRef<number[]>([]);
  const activePromotionRevealTimeoutBySideRef = useRef<Partial<Record<SideId, number>>>({});
  const appliedVisibleHpBatchRef = useRef<string>("");

  const retainedKoDisplayGame = withRetainedKoBoard(baseDisplayGame, battleEffectQueue, koRetainedBoardBySide);
  const displayGame = withKoVacantActive(retainedKoDisplayGame, koVacancyBySide);

  const hasKoVacancy = Boolean(koVacancyBySide.player || koVacancyBySide.opponent);
  const hasKoPromotionLock = Boolean(koPromotionLockedBySide.player || koPromotionLockedBySide.opponent);
  const hasActivePromotionReveal = Boolean(activePromotionRevealingBySide.player || activePromotionRevealingBySide.opponent);
  const visualFlowBlocked = battleEffectQueue.length > 0
    || koCrumblingUids.size > 0
    || pointGainQueue.length > 0
    || hasKoVacancy
    || hasKoPromotionLock
    || hasActivePromotionReveal
    || (cardFlowQueue.length > 0 && !pendingPlayerChoice);

  const clearKoTimers = () => {
    const timeouts = koVacancyTimeoutBySideRef.current;
    (["player", "opponent"] as SideId[]).forEach((sideId) => {
      const timeoutId = timeouts[sideId];
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      delete timeouts[sideId];
      const revealTimeoutId = activePromotionRevealTimeoutBySideRef.current[sideId];
      if (revealTimeoutId !== undefined) window.clearTimeout(revealTimeoutId);
      delete activePromotionRevealTimeoutBySideRef.current[sideId];
    });
    koCrumbleTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    koCrumbleTimeoutIdsRef.current = [];
  };

  const resetBattleVisuals = () => {
    previousBattleSnapshotRef.current = null;
    setBattleEffectQueue([]);
    setKoCrumblingUids(new Set());
    setKoRetainedActiveBySide({});
    setKoRetainedBoardBySide({});
    setKoVacancyBySide({});
    setKoPromotionLockedBySide({});
    setActivePromotionRevealingBySide({});
    setPointGainQueue([]);
    setScorePointsOverrideBySide({});
    setVisualHpByUid({});
    setVisualAttachedEnergyByUid({});
    pendingKoPromotionReleaseSidesRef.current = [];
    appliedVisibleHpBatchRef.current = "";
    clearKoTimers();
  };

  useEffect(() => () => {
    clearKoTimers();
  }, []);

  useLayoutEffect(() => {
    const current = createBattleSnapshot(baseDisplayGame);
    const previous = previousBattleSnapshotRef.current;
    if (!previous) {
      previousBattleSnapshotRef.current = current;
      return;
    }

    if (current.phase !== "play" || isCoinFlipBlocking) return;

    const effects = buildBattleEffects(previous, current, () => battleEffectIdRef.current++);
    if (effects.length > 0) {
      const koEffects = effects.filter((effect) => effect.kind === "ko" && effect.targetUid !== undefined);
      if (koEffects.length > 0) {
        const totalGainsBySide: Partial<Record<SideId, number>> = {};
        koEffects.forEach((effect) => {
          const scoringSide: SideId = effect.side === "player" ? "opponent" : "player";
          totalGainsBySide[scoringSide] = (totalGainsBySide[scoringSide] ?? 0) + 1;
        });
        setScorePointsOverrideBySide((currentOverrides) => {
          const nextOverrides = { ...currentOverrides };
          (Object.entries(totalGainsBySide) as [SideId, number][]).forEach(([scoringSide, totalGains]) => {
            if (nextOverrides[scoringSide] !== undefined) return;
            nextOverrides[scoringSide] = Math.max(0, baseDisplayGame.sides[scoringSide].points - totalGains);
          });
          return nextOverrides;
        });
      }
      const activeKoSides = effects
        .filter((effect) => effect.kind === "ko" && effect.targetSlot?.zone === "active")
        .map((effect) => effect.side);
      if (activeKoSides.length > 0) {
        setKoPromotionLockedBySide((currentLocks) => {
          const nextLocks = { ...currentLocks };
          activeKoSides.forEach((sideId) => { nextLocks[sideId] = true; });
          return nextLocks;
        });
      }
      setBattleEffectQueue((queue) => [...queue, ...effects]);
      setVisualHpByUid((currentVisualHp) => {
        const nextVisualHp = { ...currentVisualHp };
        effects.forEach((effect) => {
          if (effect.targetUid === undefined || effect.hpBefore === undefined) return;
          if (nextVisualHp[effect.targetUid] === undefined) nextVisualHp[effect.targetUid] = effect.hpBefore;
        });
        return nextVisualHp;
      });
      setVisualAttachedEnergyByUid((currentVisualEnergy) => {
        const nextVisualEnergy = { ...currentVisualEnergy };
        effects.forEach((effect) => {
          if (effect.kind !== "energy" || effect.targetUid === undefined || !effect.attachedEnergyBefore) return;
          if (nextVisualEnergy[effect.targetUid] === undefined) nextVisualEnergy[effect.targetUid] = effect.attachedEnergyBefore;
        });
        return nextVisualEnergy;
      });
    }
    previousBattleSnapshotRef.current = current;
  }, [baseDisplayGame, isCoinFlipBlocking]);

  const activeBattleEffects = battleEffectQueue[0]?.batchKey
    ? getLeadingBattleEffectBatch(battleEffectQueue)
    : battleEffectQueue[0]
      ? [battleEffectQueue[0]]
      : [];

  const scheduleKoPromotionRelease = (sideIds: SideId[]) => {
    const uniqueSideIds = Array.from(new Set(sideIds));
    uniqueSideIds.forEach((sideId) => {
      const existingTimeout = koVacancyTimeoutBySideRef.current[sideId];
      if (existingTimeout !== undefined) window.clearTimeout(existingTimeout);
      koVacancyTimeoutBySideRef.current[sideId] = window.setTimeout(() => {
        setKoVacancyBySide((current) => {
          const next = { ...current };
          delete next[sideId];
          return next;
        });
        setKoPromotionLockedBySide((current) => {
          const next = { ...current };
          delete next[sideId];
          return next;
        });
        setKoRetainedBoardBySide((current) => {
          const next = { ...current };
          delete next[sideId];
          return next;
        });
        setActivePromotionRevealingBySide((current) => ({ ...current, [sideId]: true }));
        const existingRevealTimeout = activePromotionRevealTimeoutBySideRef.current[sideId];
        if (existingRevealTimeout !== undefined) window.clearTimeout(existingRevealTimeout);
        activePromotionRevealTimeoutBySideRef.current[sideId] = window.setTimeout(() => {
          setActivePromotionRevealingBySide((current) => {
            const next = { ...current };
            delete next[sideId];
            return next;
          });
          delete activePromotionRevealTimeoutBySideRef.current[sideId];
        }, ACTIVE_PROMOTION_REVEAL_MS);
        delete koVacancyTimeoutBySideRef.current[sideId];
      }, KO_ACTIVE_VACANCY_MS);
    });
  };

  const createPointGainEvents = (koEffects: BattleEffectEvent[]): PointGainEvent[] => {
    const totalGainsBySide: Partial<Record<SideId, number>> = {};
    koEffects.forEach((effect) => {
      const scoringSide: SideId = effect.side === "player" ? "opponent" : "player";
      totalGainsBySide[scoringSide] = (totalGainsBySide[scoringSide] ?? 0) + 1;
    });

    const seenGainsBySide: Partial<Record<SideId, number>> = {};
    return koEffects.map((effect) => {
      const scoringSide: SideId = effect.side === "player" ? "opponent" : "player";
      const seen = (seenGainsBySide[scoringSide] ?? 0) + 1;
      seenGainsBySide[scoringSide] = seen;
      const totalGains = totalGainsBySide[scoringSide] ?? 1;
      const currentPoints = baseDisplayGame.sides[scoringSide].points;
      const previousPoints = Math.max(0, currentPoints - totalGains + seen - 1);
      return {
        id: pointGainIdRef.current++,
        side: scoringSide,
        previousPoints,
        points: previousPoints + 1,
      };
    });
  };

  const completeBattleEffect = () => {
    const completedEffects = getLeadingBattleEffectBatch(battleEffectQueue);
    const remaining = battleEffectQueue.slice(completedEffects.length || 1);
    const completedKoEffects = completedEffects.filter((effect) => effect.kind === "ko" && effect.targetUid !== undefined);
    const completedKoUids = completedKoEffects.map((effect) => effect.targetUid as number);
    const completedActiveKoEffects = completedKoEffects.filter((effect) => effect.targetSlot?.zone === "active");
    const pointGainEvents = createPointGainEvents(completedKoEffects);
    if (pointGainEvents.length > 0) {
      setScorePointsOverrideBySide((current) => {
        const next = { ...current };
        pointGainEvents.forEach((event) => {
          if (next[event.side] === undefined) next[event.side] = event.previousPoints;
        });
        return next;
      });
    }
    setBattleEffectQueue(remaining);
    setVisualHpByUid((currentVisualHp) => {
      const nextVisualHp = { ...currentVisualHp };
      completedEffects.forEach((effect) => {
        if (effect.targetUid === undefined || effect.hpAfter === undefined) return;
        if (completedKoUids.includes(effect.targetUid)) return;
        const hasFutureHpEvent = remaining.some((futureEffect) => futureEffect.targetUid === effect.targetUid && futureEffect.hpAfter !== undefined);
        if (!hasFutureHpEvent) delete nextVisualHp[effect.targetUid];
      });
      return nextVisualHp;
    });
    setVisualAttachedEnergyByUid((currentVisualEnergy) => {
      const nextVisualEnergy = { ...currentVisualEnergy };
      completedEffects.forEach((effect) => {
        if (effect.kind !== "energy" || effect.targetUid === undefined) return;
        if (effect.attachedEnergyAfter) nextVisualEnergy[effect.targetUid] = effect.attachedEnergyAfter;
        const hasFutureEnergyEvent = remaining.some((futureEffect) => futureEffect.kind === "energy" && futureEffect.targetUid === effect.targetUid);
        if (!hasFutureEnergyEvent) delete nextVisualEnergy[effect.targetUid];
      });
      return nextVisualEnergy;
    });
    if (completedKoUids.length > 0) {
      setKoCrumblingUids((current) => {
        const next = new Set(current);
        completedKoUids.forEach((uid) => next.add(uid));
        return next;
      });
      setKoRetainedActiveBySide((current) => {
        const next = { ...current };
        completedActiveKoEffects.forEach((effect) => {
          if (effect.targetUmamusume) next[effect.side] = cloneBattleSnapshotUmamusume(effect.targetUmamusume);
        });
        return next;
      });
      setKoRetainedBoardBySide((current) => {
        const next = { ...current };
        completedKoEffects.forEach((effect) => {
          if (effect.targetBoardBefore) next[effect.side] = cloneBattleEffectBoardSnapshot(effect.targetBoardBefore);
        });
        return next;
      });
      const crumbleTimeout = window.setTimeout(() => {
        setKoCrumblingUids((current) => {
          const next = new Set(current);
          completedKoUids.forEach((uid) => next.delete(uid));
          return next;
        });
        setVisualHpByUid((currentVisualHp) => {
          const nextVisualHp = { ...currentVisualHp };
          completedKoUids.forEach((uid) => {
            const hasFutureHpEvent = remaining.some((futureEffect) => futureEffect.targetUid === uid && futureEffect.hpAfter !== undefined);
            if (!hasFutureHpEvent) delete nextVisualHp[uid];
          });
          return nextVisualHp;
        });
        if (completedActiveKoEffects.length > 0) {
          const activeSides = Array.from(new Set(completedActiveKoEffects.map((effect) => effect.side)));
          const activeSideSet = new Set(activeSides);
          const benchOnlySides = completedKoEffects
            .map((effect) => effect.side)
            .filter((sideId) => !activeSideSet.has(sideId));
          if (benchOnlySides.length > 0) {
            setKoRetainedBoardBySide((current) => {
              const next = { ...current };
              benchOnlySides.forEach((sideId) => {
                delete next[sideId];
              });
              return next;
            });
          }
          setKoRetainedActiveBySide((current) => {
            const next = { ...current };
            activeSides.forEach((sideId) => {
              delete next[sideId];
            });
            return next;
          });
          setKoVacancyBySide((current) => {
            const next = { ...current };
            activeSides.forEach((sideId) => { next[sideId] = true; });
            return next;
          });
          if (pointGainEvents.length > 0) {
            pendingKoPromotionReleaseSidesRef.current = Array.from(new Set([...pendingKoPromotionReleaseSidesRef.current, ...activeSides]));
          } else {
            scheduleKoPromotionRelease(activeSides);
          }
        } else {
          const koSides = completedKoEffects.map((effect) => effect.side);
          setKoRetainedBoardBySide((current) => {
            const next = { ...current };
            koSides.forEach((sideId) => {
              delete next[sideId];
            });
            return next;
          });
        }
        if (pointGainEvents.length > 0) {
          setPointGainQueue((queue) => [...queue, ...pointGainEvents]);
        }
      }, KO_DISSOLVE_MS + 20);
      koCrumbleTimeoutIdsRef.current.push(crumbleTimeout);
    }
  };

  const activeKoImpactUidBySide: Partial<Record<SideId, number>> = {};
  activeBattleEffects.forEach((effect) => {
    if (effect.kind !== "ko" || effect.targetSlot?.zone !== "active" || effect.targetUid === undefined) return;
    activeKoImpactUidBySide[effect.side] = effect.targetUid;
  });
  const activeKoAnimatingUidBySide: Partial<Record<SideId, number>> = {};
  const koAnimatingUids = new Set<number>(koCrumblingUids);
  const suppressActiveReplacementBySide: Partial<Record<SideId, boolean>> = {};
  (["player", "opponent"] as SideId[]).forEach((sideId) => {
    const retainedActive = koRetainedActiveBySide[sideId];
    if (retainedActive && koAnimatingUids.has(retainedActive.uid)) {
      activeKoAnimatingUidBySide[sideId] = retainedActive.uid;
      suppressActiveReplacementBySide[sideId] = true;
    }
    if (koVacancyBySide[sideId]) suppressActiveReplacementBySide[sideId] = true;
  });

  const battleQueueHasKo = battleEffectQueue.some((effect) => effect.kind === "ko");
  const cardFlowHasPriority = !battleQueueHasKo && (cardFlowQueue[0]?.some((item) => item.group === "played" || item.group === "discarded") ?? false);
  const canShowCardFlowOverlay = cardFlowQueue.length > 0
    && (battleEffectQueue.length === 0 || cardFlowHasPriority)
    && koCrumblingUids.size === 0
    && pointGainQueue.length === 0
    && !hasKoVacancy
    && !hasKoPromotionLock
    && !hasActivePromotionReveal
    && !activeCoinFlip
    && !pendingPlayerChoice;
  const canShowBattleEffects = activeBattleEffects.length > 0
    && !activeCoinFlip
    && koCrumblingUids.size === 0
    && pointGainQueue.length === 0
    && !hasKoVacancy
    && !hasActivePromotionReveal
    && (!cardFlowHasPriority || battleQueueHasKo);

  useEffect(() => {
    if (!canShowBattleEffects) return;
    const hpEffects = activeBattleEffects.filter((effect) => effect.targetUid !== undefined && effect.hpAfter !== undefined);
    if (hpEffects.length === 0) return;
    const hpBatchSignature = hpEffects.map((effect) => `${effect.id}:${effect.targetUid}:${effect.hpAfter}`).join("|");
    if (appliedVisibleHpBatchRef.current === hpBatchSignature) return;
    appliedVisibleHpBatchRef.current = hpBatchSignature;
    setVisualHpByUid((currentVisualHp) => {
      const nextVisualHp = { ...currentVisualHp };
      hpEffects.forEach((effect) => {
        nextVisualHp[effect.targetUid!] = effect.hpAfter!;
      });
      return nextVisualHp;
    });
  }, [canShowBattleEffects, activeBattleEffects]);

  const visualScorePointsBySide: Partial<Record<SideId, number>> = { ...scorePointsOverrideBySide };
  const scorePointGainAnimatingBySide: Partial<Record<SideId, number>> = {};
  const activePointGain = pointGainQueue[0];
  if (activePointGain) {
    visualScorePointsBySide[activePointGain.side] = activePointGain.points;
    scorePointGainAnimatingBySide[activePointGain.side] = activePointGain.points;
  }

  const completePointGain = () => {
    const remainingPointGains = pointGainQueue.slice(1);
    setPointGainQueue(remainingPointGains);
    setScorePointsOverrideBySide((current) => {
      const next = { ...current };
      const completedPointGain = pointGainQueue[0];
      if (completedPointGain) {
        const nextForSide = remainingPointGains.find((event) => event.side === completedPointGain.side);
        if (nextForSide) next[completedPointGain.side] = nextForSide.previousPoints;
        else delete next[completedPointGain.side];
      }
      return next;
    });
    if (remainingPointGains.length > 0) return;
    const releaseSides = pendingKoPromotionReleaseSidesRef.current;
    if (releaseSides.length === 0) return;
    pendingKoPromotionReleaseSidesRef.current = [];
    scheduleKoPromotionRelease(releaseSides);
  };

  return {
    displayGame,
    battleEffectQueue,
    activeBattleEffects,
    completeBattleEffect,
    canShowBattleEffects,
    canShowCardFlowOverlay,
    pointGainQueue,
    completePointGain,
    koCrumblingUids,
    koAnimatingUids,
    hasKoVacancy,
    visualFlowBlocked,
    canShowSelectionPromptBase: battleEffectQueue.length === 0
      && koCrumblingUids.size === 0
      && !hasKoVacancy
      && !activeCoinFlip,
    activeKoImpactUidBySide,
    activeKoAnimatingUidBySide,
    suppressActiveReplacementBySide,
    visualHpByUid,
    visualAttachedEnergyByUid,
    visualScorePointsBySide,
    scorePointGainAnimatingBySide,
    resetBattleVisuals,
  };
}

import type { GameState, UmamusumeInstance, SideState } from "../../../../shared/src/types";
import { canAttachEnergyToUmamusume, getAllUmamusume, getCard, getDamagedUmamusume, getEvolutionTargets, getRainbowUncapTargets, getToolTargets } from "../../game/engine";
import type { ActionNoticeSource, PendingSelection } from "../../types/ui";
import { formatCardDisplayName, formatNameList } from "../../utils/format";

export function createSetupPreviewSide(side: SideState, activeIndex: number | null, benchIndexes: number[]): SideState {
  const activeCardId = activeIndex === null ? null : getSetupPreviewUmamusumeCardId(side.hand[activeIndex]);
  return {
    ...side,
    active: activeCardId ? createSetupPreviewUmamusume(activeCardId, -1) : null,
    bench: benchIndexes
      .map((index, order) => {
        const cardId = getSetupPreviewUmamusumeCardId(side.hand[index]);
        return cardId ? createSetupPreviewUmamusume(cardId, -(order + 2)) : null;
      })
      .filter((umamusume): umamusume is UmamusumeInstance => Boolean(umamusume)),
  };
}

export function createSetupHiddenOpponentSide(side: SideState): SideState {
  return { ...side, bench: [] };
}

function getSetupPreviewUmamusumeCardId(cardId?: string): string | null {
  if (!cardId) return null;
  const card = getCard(cardId);
  return card.kind === "umamusume" ? cardId : null;
}

function createSetupPreviewUmamusume(cardId: string, uid: number): UmamusumeInstance {
  const card = getCard(cardId);
  if (card.kind !== "umamusume") throw new Error(`Expected umamusume card for setup preview: ${cardId}`);
  return {
    uid,
    cardId,
    species: card.species,
    stage: card.stage,
    hp: card.hp,
    maxHp: card.hp,
    energies: { grass: 0, fire: 0, water: 0, lightning: 0, psychic: 0, fighting: 0, darkness: 0, steel: 0, colorless: 0, dragon: 0 },
    enteredTurn: 0,
    evolvedTurn: null,
    tookDamageLastTurn: false,
    tookDamageThisTurn: false,
    nextTurnDamageReduction: 0,
    usedAbilityThisTurn: false,
    toolCardId: null,
  };
}

export function getSelectableUmamusumeUids(game: GameState, pending: PendingSelection | null): Set<number> | undefined {
  if (!pending) return undefined;
  const player = game.sides.player;
  if (pending.kind === "attachEnergy") {
    return new Set(
      getAllUmamusume(player)
        .filter((umamusume) => canAttachEnergyToUmamusume(game, player, umamusume))
        .map((umamusume) => umamusume.uid),
    );
  }
  if (pending.kind === "zoneBenchAttachTarget") return new Set(player.bench.map((umamusume) => umamusume.uid));
  if (pending.kind === "attackHealTarget") return new Set(getDamagedUmamusume(player).map((umamusume) => umamusume.uid));
  if (pending.kind === "attackDamageTarget") return new Set(getAllUmamusume(game.sides.opponent).map((umamusume) => umamusume.uid));
  if (pending.kind === "moveEnergyAbility") return undefined;
  if (pending.kind === "abilityDamageTarget") return new Set(getAllUmamusume(game.sides.opponent).map((umamusume) => umamusume.uid));
  if (pending.kind === "retreatDiscard") return undefined;
  if (pending.kind === "retreatTarget") return new Set(player.bench.map((umamusume) => umamusume.uid));
  if (pending.kind === "forceSwitchActive") return new Set(player.bench.map((umamusume) => umamusume.uid));
  if (pending.kind === "replaceActive") return new Set(player.bench.map((umamusume) => umamusume.uid));
  if (pending.kind === "healTarget") {
    const cardId = player.hand[pending.handIndex];
    const card = cardId ? getCard(cardId) : undefined;
    if (!card || card.kind !== "trainer") return undefined;
    const targets = card.effect.healTarget === "active" ? (player.active ? [player.active] : []) : getAllUmamusume(player);
    return new Set(targets.map((umamusume) => umamusume.uid));
  }
  if (pending.kind === "evolveTarget") {
    const cardId = player.hand[pending.handIndex];
    const card = cardId ? getCard(cardId) : undefined;
    if (!card || card.kind !== "umamusume") return undefined;
    return new Set(getEvolutionTargets(game, player, card).map((umamusume) => umamusume.uid));
  }
  if (pending.kind === "toolTarget") return new Set(getToolTargets(player).map((umamusume) => umamusume.uid));
  if (pending.kind === "rainbowUncapTarget") return new Set(getRainbowUncapTargets(game, player).map((umamusume) => umamusume.uid));
  if (pending.kind === "rainbowUncapEvolution") return undefined;
  return undefined;
}

export function getOpponentStepDelay(game: GameState): number {
  if (game.opponentTurnStep === "attack" || game.opponentTurnStep === "finish") return 1400;
  return 1260;
}

export function getOpponentBannerMessage(game: GameState): string {
  if (game.pendingPlayerChoice) return game.log[0] ?? "Opponent waited for your choice.";
  const latest = game.log[0];
  if (latest && (latest.includes("Opponent") || latest.includes("coin flip"))) return latest;
  return "Opponent planned their turn.";
}

export function getOpponentAttackNotice(game: GameState): string | null {
  return game.log.find((entry) => entry.startsWith("Opponent attacked with ") || entry === "Opponent did not attack.") ?? null;
}

function getHandAdditions(previousHand: string[], nextHand: string[]): string[] {
  const previousCounts = new Map<string, number>();
  previousHand.forEach((cardId) => previousCounts.set(cardId, (previousCounts.get(cardId) ?? 0) + 1));
  return nextHand.filter((cardId) => {
    const remaining = previousCounts.get(cardId) ?? 0;
    if (remaining > 0) {
      previousCounts.set(cardId, remaining - 1);
      return false;
    }
    return true;
  });
}

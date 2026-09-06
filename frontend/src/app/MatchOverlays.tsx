import { type ComponentProps, type Dispatch, type SetStateAction, Suspense, useRef } from "react";
import type { GameState, SideId } from "../../../shared/src/types";
import type { BattleEffectEvent } from "../match/feedback/BattleEffectOverlay";
import type { CardFlowItem } from "../match/feedback/CardFlowOverlay";
import { DiscardPileModal } from "../match/modals/DiscardPileModal";
import { OpponentZonesModal } from "../match/modals/OpponentZonesModal";
import type { InspectTarget } from "../inspect";
import type { PendingSelection } from "../types/ui";
import type { CoinFlipEvent } from "./gameUiHelpers";
import { getActionNoticeTone, isBottomActionNotice } from "./gameUiHelpers";
import { cardFlowBatchKey } from "./animation";
import {
  ActionNotice,
  BattleEffectOverlay,
  CardFlowOverlay,
  CardPreview,
  CoinFlipOverlay,
  DeckChoiceModal,
  EndTurnWarningModal,
  GameOverModal,
  OpponentActionBanner,
  PointGainOverlay,
  SelectionPrompt,
} from "./lazyMatchComponents";

type CardPreviewActions = Pick<ComponentProps<typeof CardPreview>, "canUseAttack" | "canUseRetreat" | "canUseAbility" | "onAttack" | "onRetreat" | "onAbility">;

type MatchOverlaysProps = {
  displayTopBanner: ComponentProps<typeof OpponentActionBanner> | null;
  canShowBattleEffects: boolean;
  reducedMotion: boolean;
  activeBattleEffects: BattleEffectEvent[];
  completeBattleEffect: () => void;
  pointGainQueue: Array<ComponentProps<typeof PointGainOverlay>["event"]>;
  completePointGain: () => void;
  game: GameState;
  openingCoinChoicePending: boolean;
  activeCoinFlip: CoinFlipEvent | null;
  isAiVsAi: boolean;
  canChooseOpeningCoin: boolean;
  handleChooseOpeningCoin: ComponentProps<typeof CoinFlipOverlay>["onChoose"];
  formatMatchText: (text: string) => string;
  handleCoinFlipContinue: ComponentProps<typeof CoinFlipOverlay>["onContinue"];
  canShowCardFlowOverlay: boolean;
  cardFlowQueue: CardFlowItem[][];
  cardFlowGeneration: number;
  onCardFlowDone: (completedFlow: CardFlowItem[], generation: number) => void;
  canShowSelectionPrompt: boolean;
  activePendingSelection: ComponentProps<typeof SelectionPrompt>["pending"] | null;
  onSelectionCancel: ComponentProps<typeof SelectionPrompt>["onCancel"];
  onChooseAttackShuffleSelf: ComponentProps<typeof SelectionPrompt>["onChooseAttackShuffleSelf"];
  nextPlayerEnergy: ComponentProps<typeof SelectionPrompt>["nextEnergyType"];
  adjustRetreatDiscard: ComponentProps<typeof SelectionPrompt>["onRetreatDiscardAdjust"];
  confirmRetreatDiscard: ComponentProps<typeof SelectionPrompt>["onConfirmRetreatDiscard"];
  displayGame: GameState;
  previewTarget: InspectTarget | null;
  cardPreviewActions: CardPreviewActions;
  openPreview: ComponentProps<typeof CardPreview>["onInspect"];
  closePreview: ComponentProps<typeof CardPreview>["onClose"];
  endTurnWarningActions: ComponentProps<typeof EndTurnWarningModal>["actions"];
  suppressEndTurnWarningForGame: boolean;
  setSuppressEndTurnWarningForGame: Dispatch<SetStateAction<boolean>>;
  onEndTurnWarningCancel: ComponentProps<typeof EndTurnWarningModal>["onCancel"];
  onEndTurnWarningConfirm: ComponentProps<typeof EndTurnWarningModal>["onConfirm"];
  discardOpen: boolean;
  discardViewSide: SideId;
  onDiscardInspect: ComponentProps<typeof DiscardPileModal>["onInspect"];
  onCloseDiscard: ComponentProps<typeof DiscardPileModal>["onClose"];
  revealedOpponentHandOpen: boolean;
  revealedOpponentHandCardIds: string[];
  setPreviewTarget: Dispatch<SetStateAction<InspectTarget | null>>;
  setRevealedOpponentHandOpen: Dispatch<SetStateAction<boolean>>;
  opponentZonesOpen: boolean;
  onOpenOpponentDiscard: ComponentProps<typeof OpponentZonesModal>["onOpenDiscard"];
  setOpponentZonesOpen: Dispatch<SetStateAction<boolean>>;
  pendingSelection: PendingSelection | null;
  player: GameState["sides"]["player"];
  chooseScoutDeckCard: ComponentProps<typeof DeckChoiceModal>["onChoose"];
  onDeckScoutClose: ComponentProps<typeof DeckChoiceModal>["onClose"];
  actionNotice: string | null;
  onActionNoticeClose: ComponentProps<typeof ActionNotice>["onClose"];
  gameOverModalVisible: boolean;
  isNetworkMatch: boolean;
  returnToPvpLobbyForRematch: () => void;
  onPlayAgain: () => void;
  returnToMainMenu: () => void;
};

export function MatchOverlays(props: MatchOverlaysProps) {
  const {
    displayTopBanner,
    canShowBattleEffects,
    reducedMotion,
    activeBattleEffects,
    completeBattleEffect,
    pointGainQueue,
    completePointGain,
    game,
    openingCoinChoicePending,
    activeCoinFlip,
    isAiVsAi,
    canChooseOpeningCoin,
    handleChooseOpeningCoin,
    formatMatchText,
    handleCoinFlipContinue,
    canShowCardFlowOverlay,
    cardFlowQueue,
    cardFlowGeneration,
    onCardFlowDone,
    canShowSelectionPrompt,
    activePendingSelection,
    onSelectionCancel,
    onChooseAttackShuffleSelf,
    nextPlayerEnergy,
    adjustRetreatDiscard,
    confirmRetreatDiscard,
    displayGame,
    previewTarget,
    cardPreviewActions,
    openPreview,
    closePreview,
    endTurnWarningActions,
    suppressEndTurnWarningForGame,
    setSuppressEndTurnWarningForGame,
    onEndTurnWarningCancel,
    onEndTurnWarningConfirm,
    discardOpen,
    discardViewSide,
    onDiscardInspect,
    onCloseDiscard,
    revealedOpponentHandOpen,
    revealedOpponentHandCardIds,
    setPreviewTarget,
    setRevealedOpponentHandOpen,
    opponentZonesOpen,
    onOpenOpponentDiscard,
    setOpponentZonesOpen,
    pendingSelection,
    player,
    chooseScoutDeckCard,
    onDeckScoutClose,
    actionNotice,
    onActionNoticeClose,
    gameOverModalVisible,
    isNetworkMatch,
    returnToPvpLobbyForRematch,
    onPlayAgain,
    returnToMainMenu,
  } = props;
  const battleBatchRef = useRef<{ key: string; pendingIds: Set<number> }>({ key: "", pendingIds: new Set() });
  const battleBatchKey = activeBattleEffects.map((effect: BattleEffectEvent) => effect.id).join(",");
  if (battleBatchRef.current.key !== battleBatchKey) {
    battleBatchRef.current = {
      key: battleBatchKey,
      pendingIds: new Set(activeBattleEffects.map((effect: BattleEffectEvent) => effect.id)),
    };
  }
  const completeBattleMember = (id: number) => {
    const batch = battleBatchRef.current;
    if (!batch.pendingIds.delete(id)) return;
    if (batch.pendingIds.size === 0) completeBattleEffect();
  };
  const motionBySequenceRef = useRef({ battleKey: "", battleReduced: false, cardKey: "", cardReduced: false, pointId: -1, pointReduced: false });
  if (motionBySequenceRef.current.battleKey !== battleBatchKey) {
    motionBySequenceRef.current.battleKey = battleBatchKey;
    motionBySequenceRef.current.battleReduced = reducedMotion;
  }
  const cardBatchKey = cardFlowQueue[0] ? cardFlowBatchKey(cardFlowQueue[0]) : "";
  if (motionBySequenceRef.current.cardKey !== cardBatchKey) {
    motionBySequenceRef.current.cardKey = cardBatchKey;
    motionBySequenceRef.current.cardReduced = reducedMotion;
  }
  const pointEventId = pointGainQueue[0]?.id ?? -1;
  if (motionBySequenceRef.current.pointId !== pointEventId) {
    motionBySequenceRef.current.pointId = pointEventId;
    motionBySequenceRef.current.pointReduced = reducedMotion;
  }

  return (
    <>
      {displayTopBanner && (
        <Suspense fallback={null}>
          <OpponentActionBanner title={displayTopBanner.title} message={displayTopBanner.message} paused={displayTopBanner.paused} />
        </Suspense>
      )}
      {canShowBattleEffects && (
        <Suspense fallback={null}>
          {activeBattleEffects.map((effect: BattleEffectEvent, index: number) => (
            <BattleEffectOverlay
              key={effect.id}
              event={effect}
              includeStyles={index === 0}
              durationMs={motionBySequenceRef.current.battleReduced ? 180 : undefined}
              onDone={() => completeBattleMember(effect.id)}
            />
          ))}
        </Suspense>
      )}
      {pointGainQueue[0] && (
        <Suspense fallback={null}>
          <PointGainOverlay
            event={pointGainQueue[0]}
            durationMs={motionBySequenceRef.current.pointReduced ? 280 : undefined}
            onDone={completePointGain}
          />
        </Suspense>
      )}
      {game.phase === "setup" && (!game.setup?.coinFlipResult || (openingCoinChoicePending && !activeCoinFlip)) && (
        <CoinFlipOverlay
          key="opening-coin-choice"
          mode="prompt"
          message={openingCoinChoicePending
            ? "Flipping coin..."
            : isAiVsAi
              ? "AI choosing heads or tails..."
              : canChooseOpeningCoin
                ? "Choose heads or tails"
                : "Waiting for host to choose heads or tails..."}
          canChoose={canChooseOpeningCoin && !openingCoinChoicePending}
          onChoose={handleChooseOpeningCoin}
        />
      )}
      {activeCoinFlip && (
        <CoinFlipOverlay
          key={activeCoinFlip.id}
          result={activeCoinFlip.result}
          results={activeCoinFlip.results}
          message={formatMatchText(activeCoinFlip.message)}
          {...(handleCoinFlipContinue ? { onContinue: handleCoinFlipContinue } : {})}
        />
      )}
      {canShowCardFlowOverlay && cardFlowQueue[0] && (
        <Suspense fallback={null}>
          <CardFlowOverlay
            key={cardBatchKey}
            items={cardFlowQueue[0]}
            generation={cardFlowGeneration}
            durationMs={motionBySequenceRef.current.cardReduced ? 180 : game.phase === "setup" ? 1500 : 2100}
            onDone={(generation: number) => onCardFlowDone(cardFlowQueue[0] ?? [], generation)}
          />
        </Suspense>
      )}
      {canShowSelectionPrompt && activePendingSelection && (
        <SelectionPrompt
          pending={activePendingSelection}
          onCancel={onSelectionCancel}
          nextEnergyType={nextPlayerEnergy}
          {...(onChooseAttackShuffleSelf ? { onChooseAttackShuffleSelf } : {})}
          {...(adjustRetreatDiscard ? { onRetreatDiscardAdjust: adjustRetreatDiscard } : {})}
          {...(confirmRetreatDiscard ? { onConfirmRetreatDiscard: confirmRetreatDiscard } : {})}
        />
      )}
      <CardPreview
        state={displayGame}
        target={previewTarget}
        canUseAttack={cardPreviewActions.canUseAttack}
        canUseRetreat={cardPreviewActions.canUseRetreat}
        canUseAbility={cardPreviewActions.canUseAbility}
        onAttack={cardPreviewActions.onAttack}
        onRetreat={cardPreviewActions.onRetreat}
        onAbility={cardPreviewActions.onAbility}
        onInspect={openPreview}
        onClose={closePreview}
      />
      <EndTurnWarningModal
        actions={endTurnWarningActions}
        suppressForGame={suppressEndTurnWarningForGame}
        onSuppressForGameChange={setSuppressEndTurnWarningForGame}
        onCancel={onEndTurnWarningCancel}
        onConfirm={onEndTurnWarningConfirm}
      />
      {discardOpen && (
        <DiscardPileModal
          cardIds={displayGame.sides[discardViewSide].discard}
          pileLabel={discardViewSide === "opponent" ? "Opponent Discard Pile" : "Your Discard Pile"}
          onInspect={onDiscardInspect}
          onClose={onCloseDiscard}
        />
      )}
      {revealedOpponentHandOpen && (
        <DiscardPileModal
          cardIds={revealedOpponentHandCardIds}
          pileLabel="Opponent Hand (Revealed)"
          onInspect={(card) => setPreviewTarget({ card })}
          onClose={() => setRevealedOpponentHandOpen(false)}
        />
      )}
      {opponentZonesOpen && (
        <OpponentZonesModal
          handCount={displayGame.sides.opponent.hand.length}
          deckCount={displayGame.sides.opponent.deck.length}
          discardCount={displayGame.sides.opponent.discard.length}
          onOpenDiscard={onOpenOpponentDiscard}
          onClose={() => setOpponentZonesOpen(false)}
        />
      )}
      {(pendingSelection?.kind === "deckForScout" || pendingSelection?.kind === "deckForEvolutionSearch" || pendingSelection?.kind === "deckForAttackEvolution") && (
        <DeckChoiceModal
          cardIds={player.deck}
          filter={pendingSelection.kind === "deckForEvolutionSearch" || pendingSelection.kind === "deckForAttackEvolution" ? "evolutionUmamusume" : "umamusume"}
          evolvesFrom={pendingSelection.kind === "deckForAttackEvolution" ? pendingSelection.evolvesFrom : undefined}
          stage={pendingSelection.kind === "deckForAttackEvolution" ? pendingSelection.stage : undefined}
          onChoose={chooseScoutDeckCard}
          onClose={onDeckScoutClose}
        />
      )}
      {actionNotice && (
        <ActionNotice
          notice={formatMatchText(actionNotice)}
          tone={getActionNoticeTone(actionNotice)}
          placement={isBottomActionNotice(actionNotice) ? "bottom" : "top"}
          interactive={isBottomActionNotice(actionNotice)}
          onClose={onActionNoticeClose}
        />
      )}
      {game.gameOver && gameOverModalVisible && (
        <Suspense fallback={null}>
          <GameOverModal
            game={displayGame}
            playerName="You"
            opponentName="Opponent"
            onPlayAgain={isNetworkMatch ? returnToPvpLobbyForRematch : onPlayAgain}
            onMainMenu={returnToMainMenu}
          />
        </Suspense>
      )}
    </>
  );
}

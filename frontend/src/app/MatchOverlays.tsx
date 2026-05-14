import { Suspense } from "react";
import { DiscardPileModal } from "../match/modals/DiscardPileModal";
import { OpponentZonesModal } from "../match/modals/OpponentZonesModal";
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

type MatchOverlaysProps = Record<string, any>;

export function MatchOverlays(props: MatchOverlaysProps) {
  const {
    displayTopBanner,
    canShowBattleEffects,
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

  return (
    <>
      {displayTopBanner && (
        <Suspense fallback={null}>
          <OpponentActionBanner title={displayTopBanner.title} message={displayTopBanner.message} paused={displayTopBanner.paused} />
        </Suspense>
      )}
      {canShowBattleEffects && (
        <Suspense fallback={null}>
          {activeBattleEffects.map((effect: any, index: number) => (
            <BattleEffectOverlay
              key={effect.id}
              event={effect}
              onDone={index === activeBattleEffects.length - 1 ? completeBattleEffect : () => undefined}
            />
          ))}
        </Suspense>
      )}
      {pointGainQueue[0] && (
        <Suspense fallback={null}>
          <PointGainOverlay
            event={pointGainQueue[0]}
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
          onContinue={handleCoinFlipContinue}
        />
      )}
      {canShowCardFlowOverlay && cardFlowQueue[0] && (
        <Suspense fallback={null}>
          <CardFlowOverlay
            key={cardFlowBatchKey(cardFlowQueue[0])}
            items={cardFlowQueue[0]}
            durationMs={game.phase === "setup" ? 1500 : 2100}
            onDone={() => onCardFlowDone(cardFlowQueue[0] ?? [])}
          />
        </Suspense>
      )}
      {canShowSelectionPrompt && activePendingSelection && (
        <SelectionPrompt
          pending={activePendingSelection}
          onCancel={onSelectionCancel}
          onChooseAttackShuffleSelf={onChooseAttackShuffleSelf}
          nextEnergyType={nextPlayerEnergy}
          onRetreatDiscardAdjust={adjustRetreatDiscard}
          onConfirmRetreatDiscard={confirmRetreatDiscard}
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
          onInspect={(card: any) => setPreviewTarget({ card })}
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

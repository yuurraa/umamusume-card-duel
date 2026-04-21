import { useRef, useState } from "react";
import {
  canAttachEnergy,
  createGame,
} from "../game/engine";
import type { InspectTarget } from "../inspect";
import type { AppScreen, MatchMode, PendingSelection } from "../types/ui";
import { getDeckById, readEquippedDeckId, pickRandomOpponentDeck } from "../utils/deck";
import { CardPreview } from "../match/modals/CardPreview";
import { DiscardPileModal } from "../match/modals/DiscardPileModal";
import { DeckChoiceModal } from "../match/modals/DeckChoiceModal";
import { GameOverModal } from "../match/modals/GameOverModal";
import { EndTurnWarningModal } from "../match/modals/EndTurnWarningModal";
import { SelectionPrompt } from "../match/controls/SelectionPrompt";
import { OpponentActionBanner } from "../match/feedback/OpponentActionBanner";
import { ActionNotice } from "../match/feedback/ActionNotice";
import { CoinFlipOverlay } from "../match/feedback/CoinFlipOverlay";
import {
  getPlaymatTextTone,
  getSelectedPlaymat,
  getSelectedSleeve,
  getRandomCustomisationSettings,
  readCustomisationSettings,
  type CustomisationSettings,
} from "../utils/customisation";
import {
  type CoinFlipEvent,
  formatKoActionNotice,
  getActionNoticeTone,
  getKoCauseFromEntries,
  getNewLogEntries,
  getPendingAttackCoinFlip,
  getTopActionBanner,
  isBottomActionNotice,
  toCoinFlipEvent,
} from "./gameUiHelpers";
import { appStyle, matchBackgroundLayerStyle, screenFadeOverlayStyle } from "./styles";
import { renderNonMatchScreen } from "./nonMatchScreens";
import { MatchBoardLayout } from "./MatchBoardLayout";
import { useEscapeHotkey } from "./hooks/useEscapeHotkey";
import { useLogNotifications } from "./hooks/useLogNotifications";
import { type PendingCoinAttack, useMatchActions } from "./hooks/useMatchActions";
import { useCardPreviewActions } from "./hooks/useCardPreviewActions";
import { useCoinFlipResolution } from "./hooks/useCoinFlipResolution";
import { useMatchDerivedState } from "./hooks/useMatchDerivedState";
import { useSetupActions } from "./hooks/useSetupActions";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useAppRuntimeEffects } from "./hooks/useAppRuntimeEffects";
import { useMatchUiActions } from "./hooks/useMatchUiActions";
import { useMatchModalActions } from "./hooks/useMatchModalActions";

export function App() {
  const [screen, setScreen] = useState<AppScreen>("mainMenu");
  const [pendingScreen, setPendingScreen] = useState<AppScreen | null>(null);
  const [screenFadeOverlayOpacity, setScreenFadeOverlayOpacity] = useState(0);
  const [equippedDeckId, setEquippedDeckId] = useState(() => readEquippedDeckId());
  const [matchMode, setMatchMode] = useState<MatchMode>("playerVsAi");
  const [customisation, setCustomisation] = useState<CustomisationSettings>(() => readCustomisationSettings());
  const [opponentCustomisation, setOpponentCustomisation] = useState<CustomisationSettings>(() => getRandomCustomisationSettings());
  const [game, setGame] = useState(() => {
    const playerDeck = getDeckById(readEquippedDeckId());
    const opponent = pickRandomOpponentDeck();
    return createGame(playerDeck.cardIds, opponent.cardIds, opponent.name);
  });
  const [previewTarget, setPreviewTarget] = useState<InspectTarget | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [endTurnWarningActions, setEndTurnWarningActions] = useState<string[] | null>(null);
  const [suppressEndTurnWarningForGame, setSuppressEndTurnWarningForGame] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [coinFlipQueue, setCoinFlipQueue] = useState<CoinFlipEvent[]>([]);
  const [activeCoinFlip, setActiveCoinFlip] = useState<CoinFlipEvent | null>(null);
  const [acknowledgedCoinLogMessage, setAcknowledgedCoinLogMessage] = useState<string | null>(null);
  const [pendingCoinAttack, setPendingCoinAttack] = useState<PendingCoinAttack | null>(null);
  const [setupActiveIndex, setSetupActiveIndex] = useState<number | null>(null);
  const [setupBenchIndexes, setSetupBenchIndexes] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [opponentSetupRevealToken, setOpponentSetupRevealToken] = useState(0);
  const previousLogRef = useRef<string[]>([]);
  const wasSetupCoinFlipBlockingRef = useRef(false);
  const coinFlipIdRef = useRef(1);
  const skipNextCoinLogMessageRef = useRef<string | null>(null);
  const equippedDeck = getDeckById(equippedDeckId);
  const selectedPlaymat = getSelectedPlaymat(customisation);
  const uiTextTone = getPlaymatTextTone(customisation);
  const selectedSleeve = getSelectedSleeve(customisation);
  const opponentPlaymat = getSelectedPlaymat(opponentCustomisation);
  const opponentSleeve = getSelectedSleeve(opponentCustomisation);
  const isAiVsAi = matchMode === "aiVsAi";
  const player = game.sides.player;
  const nextPlayerEnergy = player.energyZone[0] ?? null;
  const {
    activePendingSelection,
    playerSelectableUmamusumeUids,
    opponentSelectableUmamusumeUids,
    selectableHandIndexes,
    abilityEnergyTypes,
    hiddenOpponent,
    isBusyWithChoice,
    isCoinFlipBlocking,
    isTurnFlowBlocked,
    opponentBoardHidden,
    displayedPlayerSide,
    displayedOpponentSide,
    hiddenOpponentBenchCount,
    showPlayerPlaymat,
    showOpponentPlaymat,
    setupDragHandIndexByUid,
    abilityReadyUmamusumeUids,
    stadiumAbilityReady,
  } = useMatchDerivedState({
    game,
    player,
    pendingSelection,
    setupActiveIndex,
    setupBenchIndexes,
    endTurnWarningActions,
    activeCoinFlip,
    coinFlipQueue,
    acknowledgedCoinLogMessage,
  });

  const {
    applySetupActive,
    promoteSetupBenchToActive,
    applySetupBench,
  } = useSetupActions({
    playerHand: player.hand,
    setupActiveIndex,
    setupBenchIndexes,
    isTurnFlowBlocked,
    setSetupActiveIndex,
    setSetupBenchIndexes,
  });

  const {
    startNewGame,
    navigateToScreen,
    playEquippedDeck,
    startWithMode,
    returnToMainMenu,
    quitApp,
    toggleMenu,
    handleSurrender,
    cancelPendingSelection,
    openPreview,
    closePreview,
  } = useAppNavigation({
    screen,
    pendingScreen,
    matchMode,
    equippedDeckCardIds: equippedDeck.cardIds,
    hasPendingPlayerChoice: Boolean(game.pendingPlayerChoice),
    isTurnFlowBlocked,
    previousLogRef,
    skipNextCoinLogMessageRef,
    setMatchMode,
    setPendingScreen,
    setGame,
    setCoinFlipQueue,
    setActiveCoinFlip,
    setAcknowledgedCoinLogMessage,
    setPendingCoinAttack,
    setSetupActiveIndex,
    setSetupBenchIndexes,
    setPendingSelection,
    setPreviewTarget,
    setSuppressEndTurnWarningForGame,
    setActionNotice,
    setDiscardOpen,
    setMenuOpen,
    setOpponentCustomisation,
    setEndTurnWarningActions,
  });

  const {
    adjustRetreatDiscard,
    confirmRetreatDiscard,
    handleEndTurn,
    applyPlayerGameUpdate,
  } = useMatchUiActions({
    game,
    player,
    isAiVsAi,
    isTurnFlowBlocked,
    isBusyWithChoice,
    suppressEndTurnWarningForGame,
    setGame,
    setPendingSelection,
    setEndTurnWarningActions,
  });
  const {
    onOpenDiscard,
    onCloseDiscard,
    onDiscardInspect,
    onEndTurnWarningCancel,
    onEndTurnWarningConfirm,
    onDeckScoutClose,
    onActionNoticeClose,
    onSelectionCancel,
    onPlayAgain,
  } = useMatchModalActions({
    isAiVsAi,
    pendingSelection,
    hasPendingPlayerChoice: Boolean(game.pendingPlayerChoice),
    startNewGame,
    cancelPendingSelection,
    setGame,
    setDiscardOpen,
    setEndTurnWarningActions,
    setPreviewTarget,
    setPendingSelection,
    setActionNotice,
  });

  useAppRuntimeEffects({
    game,
    player,
    isAiVsAi,
    isTurnFlowBlocked,
    isCoinFlipBlocking,
    hiddenOpponent,
    equippedDeckId: equippedDeck.id,
    customisation,
    screen,
    pendingScreen,
    actionNotice,
    previewTarget,
    endTurnWarningActions,
    pendingSelection,
    activeCoinFlip,
    coinFlipQueue,
    coinFlipIdRef,
    wasSetupCoinFlipBlockingRef,
    setGame,
    setScreen,
    setPendingScreen,
    setScreenFadeOverlayOpacity,
    setActionNotice,
    setPreviewTarget,
    setOpponentSetupRevealToken,
    setPendingSelection,
    setEndTurnWarningActions,
    setSetupActiveIndex,
    setSetupBenchIndexes,
    setDiscardOpen,
    setMenuOpen,
    setPendingCoinAttack,
    setActiveCoinFlip,
    setCoinFlipQueue,
  });

  useEscapeHotkey({
    screen,
    gameOver: game.gameOver,
    hasPendingPlayerChoice: Boolean(game.pendingPlayerChoice),
    isTurnFlowBlocked,
    endTurnWarningActions,
    previewTarget,
    discardOpen,
    pendingSelection,
    actionNotice,
    menuOpen,
    navigateToScreen,
    setEndTurnWarningActions,
    setPreviewTarget,
    setDiscardOpen,
    setPendingSelection,
    setActionNotice,
    setMenuOpen,
    isBottomActionNotice,
  });

  useLogNotifications({
    gameLog: game.log,
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
  });

  const {
    playHandCardOnCenter,
    playHandCardOnStadiumSpot,
    playHandCardOnUmamusume,
    playHandCardOnBenchSlot,
    attachEnergyByDrop,
    moveAbilityEnergyByDrop,
    chooseHandCard,
    chooseScoutDeckCard,
    selectUmamusume,
    handleSetupReady,
  } = useMatchActions({
    game,
    player,
    isAiVsAi,
    pendingSelection,
    selectableHandIndexes,
    isTurnFlowBlocked,
    setupActiveIndex,
    setupBenchIndexes,
    coinFlipIdRef,
    setGame,
    setPendingSelection,
    setPreviewTarget,
    setPendingCoinAttack,
    setActiveCoinFlip,
    applyPlayerGameUpdate,
    getPendingAttackCoinFlip,
  });
  const cardPreviewActions = useCardPreviewActions({
    game,
    player,
    previewTarget,
    isTurnFlowBlocked,
    coinFlipIdRef,
    setGame,
    setPendingSelection,
    setPreviewTarget,
    setPendingCoinAttack,
    setActiveCoinFlip,
    applyPlayerGameUpdate,
    getPendingAttackCoinFlip,
  });
  const { handleCoinFlipContinue } = useCoinFlipResolution({
    game,
    activeCoinFlip,
    pendingCoinAttack,
    skipNextCoinLogMessageRef,
    setGame,
    setPendingCoinAttack,
    setActiveCoinFlip,
    setCoinFlipQueue,
    setAcknowledgedCoinLogMessage,
    toCoinFlipEvent,
  });
  const canAttachInHeader = canAttachEnergy(game, player) && !isBusyWithChoice;
  const canEndTurnInHeader = !isAiVsAi && !game.gameOver && game.currentSide === "player" && !isBusyWithChoice;
  const canSetupReady = !isAiVsAi;
  const canSurrenderInPanels = !game.gameOver && !isTurnFlowBlocked;
  const playerExtraEnergyCount = Math.max(0, player.energyZone.length - 1);
  const topBanner = getTopActionBanner(game);

  const nonMatchScreen = renderNonMatchScreen({
    screen,
    selectedPlaymatImage: selectedPlaymat.image,
    uiTextTone,
    screenFadeOverlayOpacity,
    equippedDeck,
    customisation,
    navigateToScreen,
    setEquippedDeckId,
    setCustomisation,
    startWithMode,
    playEquippedDeck,
    quitApp,
  });
  if (nonMatchScreen) return nonMatchScreen;

  return (
    <main style={appStyle(false, undefined, uiTextTone)}>
      <div style={matchBackgroundLayerStyle(selectedPlaymat.image, showPlayerPlaymat ? 1 : 0)} />
      <div style={matchBackgroundLayerStyle(opponentPlaymat.image, showOpponentPlaymat ? 1 : 0)} />
      <MatchBoardLayout
        game={game}
        displayedPlayerSide={displayedPlayerSide}
        displayedOpponentSide={displayedOpponentSide}
        hiddenOpponent={hiddenOpponent}
        opponentBoardHidden={opponentBoardHidden}
        opponentSetupRevealToken={opponentSetupRevealToken}
        hiddenOpponentBenchCount={hiddenOpponentBenchCount}
        abilityReadyUmamusumeUids={abilityReadyUmamusumeUids}
        playerSelectableUmamusumeUids={playerSelectableUmamusumeUids}
        opponentSelectableUmamusumeUids={opponentSelectableUmamusumeUids}
        abilityEnergyTypes={abilityEnergyTypes}
        setupDragHandIndexByUid={setupDragHandIndexByUid}
        onInspect={openPreview}
        onUmamusumeSelect={selectUmamusume}
        onSetupDropActive={applySetupActive}
        onSetupDropBench={applySetupBench}
        onSetupPromoteToActive={promoteSetupBenchToActive}
        onHandCardDropOnUmamusume={playHandCardOnUmamusume}
        onHandCardDropOnBenchSlot={playHandCardOnBenchSlot}
        onEnergyDropOnUmamusume={attachEnergyByDrop}
        onAbilityEnergyDropOnActive={moveAbilityEnergyByDrop}
        opponentSleeveImage={opponentSleeve.image}
        stadiumAbilityReady={stadiumAbilityReady}
        onDropHandCardOnStadium={playHandCardOnStadiumSpot}
        onDropHandCardOnCenter={playHandCardOnCenter}
        setupActiveIndex={setupActiveIndex}
        setupBenchIndexes={setupBenchIndexes}
        menuOpen={menuOpen}
        canSurrender={canSurrenderInPanels}
        onToggleMenu={toggleMenu}
        onSurrender={handleSurrender}
        onSetupReady={handleSetupReady}
        canSetupReady={canSetupReady}
        selectedSleeveImage={selectedSleeve.image}
        canAttach={canAttachInHeader}
        nextPlayerEnergy={nextPlayerEnergy}
        playerExtraEnergyCount={playerExtraEnergyCount}
        canEndTurn={canEndTurnInHeader}
        onEndTurn={handleEndTurn}
        selectableHandIndexes={selectableHandIndexes}
        onChooseHandCard={chooseHandCard}
        onOpenDiscard={onOpenDiscard}
      />
      {topBanner && <OpponentActionBanner title={topBanner.title} message={topBanner.message} paused={topBanner.paused} />}
      {activeCoinFlip && (
        <CoinFlipOverlay
          key={activeCoinFlip.id}
          result={activeCoinFlip.result}
          message={activeCoinFlip.message}
          onContinue={handleCoinFlipContinue}
        />
      )}
      {activePendingSelection && (
        <SelectionPrompt
          pending={activePendingSelection}
          onCancel={onSelectionCancel}
          nextEnergyType={nextPlayerEnergy}
          onRetreatDiscardAdjust={adjustRetreatDiscard}
          onConfirmRetreatDiscard={confirmRetreatDiscard}
        />
      )}
      <CardPreview
        state={game}
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
          cardIds={player.discard}
          onInspect={onDiscardInspect}
          onClose={onCloseDiscard}
        />
      )}
      {pendingSelection?.kind === "deckForScout" && (
        <DeckChoiceModal
          cardIds={player.deck}
          onChoose={chooseScoutDeckCard}
          onClose={onDeckScoutClose}
        />
      )}
      {actionNotice && (
        <ActionNotice
          notice={actionNotice}
          tone={getActionNoticeTone(actionNotice)}
          placement={isBottomActionNotice(actionNotice) ? "bottom" : "top"}
          interactive={isBottomActionNotice(actionNotice)}
          onClose={onActionNoticeClose}
        />
      )}
      {game.gameOver && <GameOverModal game={game} onPlayAgain={onPlayAgain} onMainMenu={returnToMainMenu} />}
      <div style={screenFadeOverlayStyle(screenFadeOverlayOpacity)} />
    </main>
  );
}

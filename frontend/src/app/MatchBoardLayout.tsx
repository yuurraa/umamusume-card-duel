import type { CSSProperties } from "react";
import type { EnergyType, GameState, SideState, UmamusumeInstance } from "../../../shared/src/types";
import type { InspectTarget } from "../inspect";
import { Hand } from "../components/boards/Hand";
import { SideBoard } from "../components/boards/SideBoard";
import { PlayDropZone } from "../match/board/PlayDropZone";
import { StadiumSpot } from "../match/board/StadiumSpot";
import { PlayHandHeader } from "../match/controls/HandControls";
import { PregameSetupPanel } from "../match/setup/PregameSetupPanel";
import { contentStyle, duelGridStyle, handPanelStyle } from "./styles";

type MatchBoardLayoutProps = {
  game: GameState;
  displayedPlayerSide: SideState;
  displayedOpponentSide: SideState;
  hiddenOpponent: boolean;
  opponentBoardHidden: boolean;
  opponentSetupRevealToken: number;
  povSwitchAnimationToken: number;
  hiddenOpponentBenchCount: number | undefined;
  abilityReadyUmamusumeUids: Set<number> | undefined;
  playerSelectableUmamusumeUids: Set<number> | undefined;
  opponentSelectableUmamusumeUids: Set<number> | undefined;
  abilityEnergyTypes: Set<EnergyType> | undefined;
  setupDragHandIndexByUid: Record<number, number>;
  onInspect: (target: InspectTarget) => void;
  onUmamusumeSelect: (umamusume: UmamusumeInstance) => void;
  onAttachedToolSelect?: ((umamusumeUid: number) => void) | undefined;
  onSetupDropActive: (index: number) => void;
  onSetupDropBench: (index: number) => void;
  onSetupPromoteToActive: (index: number) => void;
  onHandCardDropOnUmamusume: (handIndex: number, umamusumeUid: number) => void;
  onHandCardDropOnBenchSlot: (handIndex: number) => void;
  onEnergyDropOnUmamusume: (umamusumeUid: number) => void;
  onAbilityEnergyDropOnActive: (sourceUmamusumeUid: number, energyType: EnergyType) => void;
  opponentSleeveImage: string | null;
  stadiumAbilityReady: boolean;
  onDropHandCardOnStadium: (handIndex: number) => void;
  onSelectStadiumTarget: () => void;
  stadiumSelectable: boolean;
  onDropHandCardOnCenter: (handIndex: number) => void;
  setupActiveIndex: number | null;
  setupBenchIndexes: number[];
  menuOpen: boolean;
  canSurrender: boolean;
  onToggleMenu: () => void;
  onSurrender: () => void;
  onSetupReady: () => void;
  canSetupReady: boolean;
  canSetupInteract: boolean;
  onSwitchPov?: (() => void) | undefined;
  selectedSleeveImage: string | null;
  canPlayHandCards: boolean;
  handDrawRevealEnabled?: boolean;
  handDeferredRevealCardIds?: string[];
  canAttach: boolean;
  nextPlayerEnergy: EnergyType | null;
  playerExtraEnergyCount: number;
  canEndTurn: boolean;
  turnLabel?: string | undefined;
  turnAlert?: boolean | undefined;
  onEndTurn: () => void;
  selectableHandIndexes: Set<number> | undefined;
  onChooseHandCard: (handIndex: number) => void;
  onOpenDiscard: () => void;
  onOpenOpponentZones: () => void;
  displayLog: string[];
};

export function MatchBoardLayout(props: MatchBoardLayoutProps) {
  const {
    game,
    displayedPlayerSide,
    displayedOpponentSide,
    hiddenOpponent,
    opponentBoardHidden,
    opponentSetupRevealToken,
    povSwitchAnimationToken,
    hiddenOpponentBenchCount,
    abilityReadyUmamusumeUids,
    playerSelectableUmamusumeUids,
    opponentSelectableUmamusumeUids,
    abilityEnergyTypes,
    setupDragHandIndexByUid,
    onInspect,
    onUmamusumeSelect,
    onAttachedToolSelect,
    onSetupDropActive,
    onSetupDropBench,
    onSetupPromoteToActive,
    onHandCardDropOnUmamusume,
    onHandCardDropOnBenchSlot,
    onEnergyDropOnUmamusume,
    onAbilityEnergyDropOnActive,
    opponentSleeveImage,
    stadiumAbilityReady,
    onDropHandCardOnStadium,
    onSelectStadiumTarget,
    stadiumSelectable,
    onDropHandCardOnCenter,
    setupActiveIndex,
    setupBenchIndexes,
    menuOpen,
    canSurrender,
    onToggleMenu,
    onSurrender,
    onSetupReady,
    canSetupReady,
    canSetupInteract,
    onSwitchPov,
    selectedSleeveImage,
    canPlayHandCards,
    handDrawRevealEnabled = true,
    handDeferredRevealCardIds = [],
    canAttach,
    nextPlayerEnergy,
    playerExtraEnergyCount,
    canEndTurn,
    turnLabel,
    turnAlert,
    onEndTurn,
    selectableHandIndexes,
    onChooseHandCard,
    onOpenDiscard,
    onOpenOpponentZones,
    displayLog,
  } = props;

  const playerSetupRevealToken = (() => {
    // Stable across "Ready" toggles; only changes when the selected setup cards change.
    // Keeps setup animations from replaying when pressing Ready.
    let token = (setupActiveIndex ?? -1) + 2;
    for (const benchIndex of setupBenchIndexes) token = (token * 31 + (benchIndex + 2)) % 1000000007;
    return token;
  })();

  return (
    <div style={contentStyle}>
      <div style={duelViewportStyle}>
        <section style={duelGridStyle}>
          <div style={playerBoardSlotStyle}>
            <SideBoard
              side={displayedPlayerSide}
              sideId="player"
              onInspect={onInspect}
              setupMode={game.phase === "setup"}
              abilityReadyUmamusumeUids={abilityReadyUmamusumeUids}
              selectableUmamusumeUids={game.phase === "play" ? playerSelectableUmamusumeUids : undefined}
              abilityEnergyTypes={abilityEnergyTypes}
              onUmamusumeSelect={onUmamusumeSelect}
              onAttachedToolSelect={onAttachedToolSelect}
              onSetupDropActive={onSetupDropActive}
              onSetupDropBench={onSetupDropBench}
              onSetupPromoteToActive={onSetupPromoteToActive}
              setupInteractionsEnabled={canSetupInteract}
              onHandCardDropOnActive={onHandCardDropOnUmamusume}
              onHandCardDropOnBenchSlot={onHandCardDropOnBenchSlot}
              onHandCardDropOnUmamusume={onHandCardDropOnUmamusume}
              onEnergyDropOnUmamusume={onEnergyDropOnUmamusume}
              onAbilityEnergyDropOnActive={onAbilityEnergyDropOnActive}
              setupDragHandIndexByUid={setupDragHandIndexByUid}
              animateSetupReveal={(!game.gameOver && game.phase === "setup" && displayedPlayerSide.active !== null) || povSwitchAnimationToken > 0}
              setupRevealToken={povSwitchAnimationToken > 0 ? povSwitchAnimationToken : playerSetupRevealToken}
            />
          </div>
          <div style={opponentBoardSlotStyle}>
            <SideBoard
              key={hiddenOpponent ? "opponent-setup-hidden" : "opponent-live"}
              side={displayedOpponentSide}
              sideId="opponent"
              hidden={opponentBoardHidden}
              onInspect={onInspect}
              selectableUmamusumeUids={game.phase === "play" ? opponentSelectableUmamusumeUids : undefined}
              onUmamusumeSelect={onUmamusumeSelect}
              onAttachedToolSelect={onAttachedToolSelect}
              sleeveImage={opponentSleeveImage}
              animateSetupReveal={(!game.gameOver && game.phase === "setup" && opponentBoardHidden && opponentSetupRevealToken > 0) || povSwitchAnimationToken > 0}
              setupRevealToken={povSwitchAnimationToken > 0 ? povSwitchAnimationToken : opponentSetupRevealToken}
              {...(hiddenOpponentBenchCount !== undefined ? { hiddenBenchCount: hiddenOpponentBenchCount } : {})}
            />
          </div>
          {game.phase === "play" && (
            <>
              <StadiumSpot
                state={game}
                abilityReady={stadiumAbilityReady}
                onDropHandCard={onDropHandCardOnStadium}
                onInspect={onInspect}
                selectable={stadiumSelectable}
                onSelect={onSelectStadiumTarget}
              />
              <PlayDropZone onDropHandCard={onDropHandCardOnCenter} />
            </>
          )}
        </section>
      </div>
      <section style={handPanelStyle}>
        {game.phase === "setup" ? (
          <PregameSetupPanel
            game={game}
            activeIndex={setupActiveIndex}
            benchIndexes={setupBenchIndexes}
            menuOpen={menuOpen}
            log={displayLog}
            canSurrender={canSurrender}
            onToggleMenu={onToggleMenu}
            onSurrender={onSurrender}
            onOpenOpponentZones={onOpenOpponentZones}
            onSetActive={onSetupDropActive}
            onReady={onSetupReady}
            canReady={canSetupReady}
            canInteract={canSetupInteract}
            onSwitchPov={onSwitchPov}
            onInspect={onInspect}
            sleeveImage={selectedSleeveImage}
            handDrawRevealEnabled={handDrawRevealEnabled}
            handDeferredRevealCardIds={handDeferredRevealCardIds}
          />
        ) : (
          <>
            <PlayHandHeader
              canAttach={canAttach}
              energyRefreshKey={game.turnNumber}
              energyType={nextPlayerEnergy}
              extraCount={playerExtraEnergyCount}
              turnNumber={game.turnNumber}
              turnLabel={turnLabel}
              turnAlert={turnAlert}
              canEndTurn={canEndTurn}
              onSwitchPov={onSwitchPov}
              onEndTurn={onEndTurn}
              menuOpen={menuOpen}
              log={displayLog}
              canSurrender={canSurrender}
              onToggleMenu={onToggleMenu}
              onOpenOpponentZones={onOpenOpponentZones}
              onSurrender={onSurrender}
            />
            <Hand
              state={game}
              onInspect={onInspect}
              canPlayCards={canPlayHandCards}
              drawRevealEnabled={handDrawRevealEnabled}
              deferredRevealCardIds={handDeferredRevealCardIds}
              selectableHandIndexes={selectableHandIndexes}
              onChooseHandCard={onChooseHandCard}
              onOpenDiscard={onOpenDiscard}
              sleeveImage={selectedSleeveImage}
            />
          </>
        )}
      </section>
    </div>
  );
}

const duelViewportStyle = {
  width: "100%",
  overflowX: "auto" as const,
  overflowY: "visible" as const,
};

const playerBoardSlotStyle: CSSProperties = {
  gridColumn: 1,
  justifySelf: "stretch",
  width: "100%",
  minWidth: 0,
};

const opponentBoardSlotStyle: CSSProperties = {
  gridColumn: 3,
  justifySelf: "stretch",
  width: "100%",
  minWidth: 0,
};

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
  hiddenOpponentBenchCount: number | undefined;
  abilityReadyUmamusumeUids: Set<number> | undefined;
  playerSelectableUmamusumeUids: Set<number> | undefined;
  opponentSelectableUmamusumeUids: Set<number> | undefined;
  abilityEnergyTypes: Set<EnergyType> | undefined;
  setupDragHandIndexByUid: Record<number, number>;
  onInspect: (target: InspectTarget) => void;
  onUmamusumeSelect: (umamusume: UmamusumeInstance) => void;
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
  onDropHandCardOnCenter: (handIndex: number) => void;
  setupActiveIndex: number | null;
  setupBenchIndexes: number[];
  menuOpen: boolean;
  canSurrender: boolean;
  onToggleMenu: () => void;
  onSurrender: () => void;
  onSetupReady: () => void;
  selectedSleeveImage: string | null;
  canAttach: boolean;
  nextPlayerEnergy: EnergyType | null;
  playerExtraEnergyCount: number;
  canEndTurn: boolean;
  onEndTurn: () => void;
  selectableHandIndexes: Set<number> | undefined;
  onChooseHandCard: (handIndex: number) => void;
  onOpenDiscard: () => void;
};

export function MatchBoardLayout(props: MatchBoardLayoutProps) {
  const {
    game,
    displayedPlayerSide,
    displayedOpponentSide,
    hiddenOpponent,
    opponentBoardHidden,
    opponentSetupRevealToken,
    hiddenOpponentBenchCount,
    abilityReadyUmamusumeUids,
    playerSelectableUmamusumeUids,
    opponentSelectableUmamusumeUids,
    abilityEnergyTypes,
    setupDragHandIndexByUid,
    onInspect,
    onUmamusumeSelect,
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
    onDropHandCardOnCenter,
    setupActiveIndex,
    setupBenchIndexes,
    menuOpen,
    canSurrender,
    onToggleMenu,
    onSurrender,
    onSetupReady,
    selectedSleeveImage,
    canAttach,
    nextPlayerEnergy,
    playerExtraEnergyCount,
    canEndTurn,
    onEndTurn,
    selectableHandIndexes,
    onChooseHandCard,
    onOpenDiscard,
  } = props;

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
              onSetupDropActive={onSetupDropActive}
              onSetupDropBench={onSetupDropBench}
              onSetupPromoteToActive={onSetupPromoteToActive}
              onHandCardDropOnActive={onHandCardDropOnUmamusume}
              onHandCardDropOnBenchSlot={onHandCardDropOnBenchSlot}
              onHandCardDropOnUmamusume={onHandCardDropOnUmamusume}
              onEnergyDropOnUmamusume={onEnergyDropOnUmamusume}
              onAbilityEnergyDropOnActive={onAbilityEnergyDropOnActive}
              setupDragHandIndexByUid={setupDragHandIndexByUid}
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
              sleeveImage={opponentSleeveImage}
              animateSetupReveal={game.phase === "setup" && opponentBoardHidden && opponentSetupRevealToken > 0}
              setupRevealToken={opponentSetupRevealToken}
              {...(hiddenOpponentBenchCount !== undefined ? { hiddenBenchCount: hiddenOpponentBenchCount } : {})}
            />
          </div>
          {game.phase === "play" && (
            <>
              <StadiumSpot state={game} abilityReady={stadiumAbilityReady} onDropHandCard={onDropHandCardOnStadium} onInspect={onInspect} />
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
            log={game.log}
            canSurrender={canSurrender}
            onToggleMenu={onToggleMenu}
            onSurrender={onSurrender}
            onSetActive={onSetupDropActive}
            onReady={onSetupReady}
            onInspect={onInspect}
            sleeveImage={selectedSleeveImage}
          />
        ) : (
          <>
            <PlayHandHeader
              canAttach={canAttach}
              energyRefreshKey={game.turnNumber}
              energyType={nextPlayerEnergy}
              extraCount={playerExtraEnergyCount}
              turnNumber={game.turnNumber}
              canEndTurn={canEndTurn}
              onEndTurn={onEndTurn}
              menuOpen={menuOpen}
              log={game.log}
              canSurrender={canSurrender}
              onToggleMenu={onToggleMenu}
              onSurrender={onSurrender}
            />
            <Hand
              state={game}
              onInspect={onInspect}
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

import { lazy } from "react";

const loadMatchBoardLayout = () => import("./MatchBoardLayout");

export const MatchBoardLayout = lazy(() => loadMatchBoardLayout().then((module) => ({
  default: module.MatchBoardLayout,
})));
export const CardPreview = lazy(() => import("../match/modals/CardPreview").then((module) => ({
  default: module.CardPreview,
})));
export const DeckChoiceModal = lazy(() => import("../match/modals/DeckChoiceModal").then((module) => ({
  default: module.DeckChoiceModal,
})));
export const GameOverModal = lazy(() => import("../match/modals/GameOverModal").then((module) => ({
  default: module.GameOverModal,
})));
export const EndTurnWarningModal = lazy(() => import("../match/modals/EndTurnWarningModal").then((module) => ({
  default: module.EndTurnWarningModal,
})));
export const SelectionPrompt = lazy(() => import("../match/controls/SelectionPrompt").then((module) => ({
  default: module.SelectionPrompt,
})));
export const OpponentActionBanner = lazy(() => import("../match/feedback/OpponentActionBanner").then((module) => ({
  default: module.OpponentActionBanner,
})));
export const ActionNotice = lazy(() => import("../match/feedback/ActionNotice").then((module) => ({
  default: module.ActionNotice,
})));
export const CoinFlipOverlay = lazy(() => import("../match/feedback/CoinFlipOverlay").then((module) => ({
  default: module.CoinFlipOverlay,
})));
export const CardFlowOverlay = lazy(() => import("../match/feedback/CardFlowOverlay").then((module) => ({
  default: module.CardFlowOverlay,
})));
export const BattleEffectOverlay = lazy(() => import("../match/feedback/BattleEffectOverlay").then((module) => ({
  default: module.BattleEffectOverlay,
})));
export const PointGainOverlay = lazy(() => import("../match/feedback/PointGainOverlay").then((module) => ({
  default: module.PointGainOverlay,
})));

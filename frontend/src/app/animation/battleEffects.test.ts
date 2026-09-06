import { afterEach, describe, expect, it, vi } from "vitest";
import { opponentDeckList, playerDeckList } from "../../../../shared/src/gameData";
import { createGame, createUmamusume, playerAttack } from "../../game/engine";
import { buildBattleEffects, createBattleSnapshot } from "./battleEffects";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("structured battle events", () => {
  it("uses attack and KO event identities when building lethal visuals", () => {
    const state = createGame(playerDeckList, opponentDeckList);
    state.phase = "play";
    state.setup = null;
    state.currentSide = "player";
    state.sides.player.active = createUmamusume(state, "riceShowerStage2", 1);
    state.sides.player.active.energies.darkness = 2;
    state.sides.opponent.active = createUmamusume(state, "riceShowerBasic", 1);
    state.sides.opponent.active.hp = 40;
    const targetUid = state.sides.opponent.active.uid;

    const previous = createBattleSnapshot(state);
    const next = playerAttack(state);
    const current = createBattleSnapshot(next);
    const effects = buildBattleEffects(previous, current, (() => {
      let id = 0;
      return () => ++id;
    })());

    expect(effects.map((effect) => effect.kind)).toEqual(["attack", "damage", "ko"]);
    expect(effects[0]?.targetUid).toBe(targetUid);
    expect(effects[2]?.targetUid).toBe(targetUid);
  });

  it("reuses captured geometry for cards that remain on the board", () => {
    const state = createGame(playerDeckList, opponentDeckList);
    state.phase = "play";
    state.setup = null;
    state.sides.player.active = createUmamusume(state, "riceShowerBasic", 0);
    const uid = state.sides.player.active.uid;
    const rect = { x: 12, y: 24, width: 88, height: 124 };
    const querySelector = vi.spyOn(document, "querySelector");

    const snapshot = createBattleSnapshot(state, { reuseRects: new Map([[uid, rect]]) });

    expect(snapshot.player[0]?.rect).toEqual(rect);
    expect(querySelector).not.toHaveBeenCalled();
  });
});

import type { PublicSideView } from "./publicInfo";
import { predictAttackDamage } from "./combatUtils";
import type { UmamusumeInstance } from "../../../../../../shared/src/types";

export function getOpponentActiveEnergyCountFromPublic(opponent: PublicSideView): number {
  if (!opponent.active) return 0;
  return Object.values(opponent.active.energies).reduce((sum, count) => sum + count, 0);
}

export function getAoiKiryuinBonusValueFromPublic(
  ownActive: UmamusumeInstance,
  opponent: PublicSideView,
  activeAttackDamageBonus: number,
  ownBenchCount: number,
  turnNumber: number,
): number {
  const target = opponent.active;
  if (!target) return 0;
  const ownInPlayCount = 1 + ownBenchCount;
  const allInPlayCount = ownInPlayCount + 1 + opponent.bench.length;
  const withoutBonus = predictAttackDamage(ownActive, target, activeAttackDamageBonus, ownInPlayCount, allInPlayCount, turnNumber);
  const withBonus = predictAttackDamage(ownActive, target, activeAttackDamageBonus + 10, ownInPlayCount, allInPlayCount, turnNumber);
  const delta = Math.max(0, withBonus - withoutBonus);
  const koSwing = withoutBonus < target.hp && withBonus >= target.hp ? 90 : 0;
  return delta * 2 + koSwing;
}

export function getYayoiAkikawaValueFromPublic(
  ownActive: UmamusumeInstance,
  opponent: PublicSideView,
  activeAttackDamageBonus: number,
  ownBenchCount: number,
  turnNumber: number,
): number {
  if (!opponent.active || opponent.bench.length === 0) return 0;
  const ownInPlayCount = 1 + ownBenchCount;
  const allInPlayCount = ownInPlayCount + 1 + opponent.bench.length;
  const damageNow = predictAttackDamage(ownActive, opponent.active, activeAttackDamageBonus, ownInPlayCount, allInPlayCount, turnNumber);
  const opponentBestReplacementForThem = [...opponent.bench]
    .map((benchTarget) => {
      const damage = predictAttackDamage(ownActive, benchTarget, activeAttackDamageBonus, ownInPlayCount, allInPlayCount, turnNumber);
      const ko = damage >= benchTarget.hp;
      return { damage, ko };
    })
    .sort((left, right) => {
      if (left.ko !== right.ko) return left.ko ? 1 : -1;
      return left.damage - right.damage;
    })[0];
  if (!opponentBestReplacementForThem) return 0;

  const damageAfterGustWorstCase = opponentBestReplacementForThem.damage;
  const koNow = damageNow >= opponent.active.hp;
  const koAfterWorstCase = opponentBestReplacementForThem.ko;
  if (!koNow && koAfterWorstCase) return 120;
  return Math.max(0, damageAfterGustWorstCase - damageNow);
}

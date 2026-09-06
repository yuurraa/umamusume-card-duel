export const BATTLE_EFFECT_KEYFRAMES = `
@keyframes battle-source-lean {
  0% { opacity: 0; transform: translateX(0) scale(1); }
  12% { opacity: 1; transform: translateX(0) scale(1.024); filter: saturate(1.16); }
  38% { opacity: 0.96; transform: translateX(11px) scale(1.038); }
  100% { opacity: 0; transform: translateX(0) scale(1); }
}

@keyframes battle-target-frame {
  0% { opacity: 0; transform: scale(0.98); filter: brightness(1); }
  16% { opacity: 1; transform: scale(1.02); filter: brightness(1.12) saturate(1.08); }
  54% { opacity: 0.68; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.035); filter: brightness(1); }
}

@keyframes battle-heal-frame {
  0% { opacity: 0; transform: scale(0.96); filter: brightness(1); }
  18% { opacity: 1; transform: scale(1.018); filter: brightness(1.16) saturate(1.12); }
  70% { opacity: 0.72; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.024); }
}

@keyframes battle-ko-frame {
  0% { opacity: 0; transform: translateX(0) rotate(0deg) scale(1); }
  13% { opacity: 1; transform: translateX(-5px) rotate(-1.6deg) scale(1.018); }
  25% { transform: translateX(5px) rotate(1.2deg) scale(1.01); }
  42% { transform: translateX(-3px) rotate(-0.8deg) scale(1); }
  100% { opacity: 0; transform: translateX(0) rotate(0deg) scale(0.96); }
}

@keyframes battle-attack-line {
  0% { opacity: 0; clip-path: inset(0 100% 0 0); }
  12% { opacity: 0.96; clip-path: inset(0 76% 0 0); }
  34% { opacity: 1; clip-path: inset(0 0 0 0); }
  60% { opacity: 0.76; clip-path: inset(0 0 0 54%); }
  100% { opacity: 0; clip-path: inset(0 0 0 100%); }
}

@keyframes battle-hit-ring {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.28); }
  20% { opacity: 1; transform: translate(-50%, -50%) scale(0.74); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.62); }
}

@keyframes battle-energy-orb {
  0% { opacity: 0; transform: translate(-50%, 38vh) scale(0.5); }
  18% { opacity: 1; transform: translate(-50%, 18vh) scale(1.08); }
  58% { opacity: 1; transform: translate(-50%, -50%) scale(0.82); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.46); }
}

@keyframes battle-particle {
  0% { opacity: 0; translate: -50% -50%; scale: 0.24; }
  18% { opacity: 1; }
  100% { opacity: 0; translate: calc(-50% + var(--battle-particle-x)) calc(-50% + var(--battle-particle-y)); scale: 0.82; }
}

@keyframes battle-heal-particle {
  0% { opacity: 0; translate: -50% -20%; scale: 0.24; }
  18% { opacity: 0.95; }
  100% { opacity: 0; translate: calc(-50% + var(--battle-particle-x)) calc(-90% + var(--battle-particle-y)); scale: 0.9; }
}

@keyframes battle-float-label {
  0% { opacity: 0; transform: translate(-50%, calc(-50% + 14px)) rotate(-8deg) scale(0.68); }
  16% { opacity: 1; transform: translate(-50%, calc(-50% - 6px)) rotate(-8deg) scale(1.12); }
  42% { transform: translate(-50%, -50%) rotate(-8deg) scale(1); }
  76% { opacity: 1; transform: translate(-50%, -50%) rotate(-8deg) scale(1); }
  100% { opacity: 0; transform: translate(-50%, calc(-50% - 26px)) rotate(-8deg) scale(0.92); }
}

@keyframes battle-ko-label {
  0% { opacity: 0; transform: translate(-50%, -50%) rotate(-8deg) scale(1.36); }
  16% { opacity: 1; transform: translate(-50%, -50%) rotate(-8deg) scale(1); }
  64% { opacity: 1; transform: translate(-50%, -50%) rotate(-8deg) scale(1); }
  100% { opacity: 0; transform: translate(-50%, calc(-50% - 18px)) rotate(-8deg) scale(0.86); }
}

@keyframes battle-evolve-veil {
  0% { opacity: 0; filter: brightness(1); }
  20% { opacity: 1; filter: brightness(1.16); }
  66% { opacity: 0.82; }
  100% { opacity: 0; filter: brightness(1); }
}

@keyframes battle-ko-veil {
  0% { opacity: 0; }
  18% { opacity: 0.82; }
  66% { opacity: 0.5; }
  100% { opacity: 0; }
}

@keyframes battle-card-sweep {
  0% { transform: translateX(0) skewX(-14deg); }
  58% { transform: translateX(420%) skewX(-14deg); }
  100% { transform: translateX(420%) skewX(-14deg); }
}
`;

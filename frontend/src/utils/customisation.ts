export type CustomisationOption = {
  id: string;
  name: string;
  image: string | null;
};

export type CustomisationSettings = {
  playmatId: string;
  sleeveId: string;
};

export const defaultPlaymat: CustomisationOption = {
  id: "default",
  name: "Aurora Stable",
  image: null,
};

export const defaultSleeve: CustomisationOption = {
  id: "default",
  name: "Aurora Stable",
  image: null,
};

export const playmatOptions: CustomisationOption[] = [
  defaultPlaymat,
  { id: "agnes-tachyon", name: "Agnes Tachyon", image: "/assets/customisation/playmat/agnes-tachyon-playmat.png" },
  { id: "manhattan-cafe", name: "Manhattan Cafe", image: "/assets/customisation/playmat/manhattan-cafe-playmat.jpg" },
  { id: "rice-shower", name: "Rice Shower", image: "/assets/customisation/playmat/rice-shower-playmat.jpg" },
  { id: "tokai-teio", name: "Tokai Teio", image: "/assets/customisation/playmat/tokai-teio-playmat.jpg" },
];

export const sleeveOptions: CustomisationOption[] = [
  defaultSleeve,
  { id: "agnes-tachyon", name: "Agnes Tachyon", image: "/assets/customisation/sleeve/agnes-tachyon-sleeve.png" },
  { id: "manhattan-cafe", name: "Manhattan Cafe", image: "/assets/customisation/sleeve/manhattan-cafe-sleeve.jpg" },
  { id: "rice-shower", name: "Rice Shower", image: "/assets/customisation/sleeve/rice-shower-sleeve.jpg" },
  { id: "tokai-teio", name: "Tokai Teio", image: "/assets/customisation/sleeve/tokai-teio-sleeve.jpg" },
];

const CUSTOMISATION_STORAGE_KEY = "umamusume-card-duel-customisation";

export function readCustomisationSettings(): CustomisationSettings {
  if (typeof window === "undefined") return getDefaultCustomisationSettings();
  const stored = window.localStorage.getItem(CUSTOMISATION_STORAGE_KEY);
  if (!stored) return getDefaultCustomisationSettings();
  try {
    const parsed = JSON.parse(stored) as Partial<CustomisationSettings>;
    return normalizeCustomisationSettings(parsed);
  } catch {
    return getDefaultCustomisationSettings();
  }
}

export function writeCustomisationSettings(settings: CustomisationSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOMISATION_STORAGE_KEY, JSON.stringify(normalizeCustomisationSettings(settings)));
}

export function getSelectedPlaymat(settings: CustomisationSettings): CustomisationOption {
  return playmatOptions.find((option) => option.id === settings.playmatId) ?? defaultPlaymat;
}

export function getSelectedSleeve(settings: CustomisationSettings): CustomisationOption {
  return sleeveOptions.find((option) => option.id === settings.sleeveId) ?? defaultSleeve;
}

export function getRandomCustomisationSettings(): CustomisationSettings {
  return {
    playmatId: pickRandomOption(playmatOptions).id,
    sleeveId: pickRandomOption(sleeveOptions).id,
  };
}

function getDefaultCustomisationSettings(): CustomisationSettings {
  return { playmatId: defaultPlaymat.id, sleeveId: defaultSleeve.id };
}

function pickRandomOption(options: CustomisationOption[]): CustomisationOption {
  const imageOptions = options.filter((option) => option.image);
  const pool = imageOptions.length > 0 ? imageOptions : options;
  return pool[Math.floor(Math.random() * pool.length)] ?? options[0] ?? defaultPlaymat;
}

function normalizeCustomisationSettings(settings: Partial<CustomisationSettings>): CustomisationSettings {
  return {
    playmatId: playmatOptions.some((option) => option.id === settings.playmatId) ? settings.playmatId! : defaultPlaymat.id,
    sleeveId: sleeveOptions.some((option) => option.id === settings.sleeveId) ? settings.sleeveId! : defaultSleeve.id,
  };
}

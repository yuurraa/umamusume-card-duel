import type { DragEvent } from "react";
import type { EnergyType } from "../../../shared/src/types";

type DragPayload =
  | { kind: "hand-card"; handIndex: number }
  | { kind: "setup-hand"; handIndex: number }
  | { kind: "energy-token" }
  | { kind: "ability-energy"; energyType: EnergyType; sourcePokemonUid: number }
  | { kind: "active-retreat"; pokemonUid: number };

const TEXT_PREFIX = "umaduel:";
const ENERGY_TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];

function encodeDragPayload(payload: DragPayload): string {
  switch (payload.kind) {
    case "hand-card":
      return `${TEXT_PREFIX}hand-card:${payload.handIndex}`;
    case "setup-hand":
      return `${TEXT_PREFIX}setup-hand:${payload.handIndex}`;
    case "energy-token":
      return `${TEXT_PREFIX}energy-token`;
    case "ability-energy":
      return `${TEXT_PREFIX}ability-energy:${payload.energyType}:${payload.sourcePokemonUid}`;
    case "active-retreat":
      return `${TEXT_PREFIX}active-retreat:${payload.pokemonUid}`;
  }
}

function parseDragPayload(raw: string): DragPayload | null {
  if (!raw.startsWith(TEXT_PREFIX)) return null;
  const parts = raw.slice(TEXT_PREFIX.length).split(":");
  const [kind, value] = parts;
  if (kind === "hand-card") {
    const handIndex = Number(value);
    return Number.isFinite(handIndex) ? { kind: "hand-card", handIndex } : null;
  }
  if (kind === "setup-hand") {
    const handIndex = Number(value);
    return Number.isFinite(handIndex) ? { kind: "setup-hand", handIndex } : null;
  }
  if (kind === "energy-token") return { kind: "energy-token" };
  if (kind === "ability-energy" && ENERGY_TYPES.includes(value as EnergyType)) {
    const sourcePokemonUid = Number(parts[2]);
    return Number.isFinite(sourcePokemonUid) ? { kind: "ability-energy", energyType: value as EnergyType, sourcePokemonUid } : null;
  }
  if (kind === "active-retreat") {
    const pokemonUid = Number(value);
    return Number.isFinite(pokemonUid) ? { kind: "active-retreat", pokemonUid } : null;
  }
  return null;
}

export function writeDragPayload(dataTransfer: DataTransfer, payload: DragPayload) {
  dataTransfer.setData("text/plain", encodeDragPayload(payload));
}

export function readDragPayload(dataTransfer: DataTransfer): DragPayload | null {
  return parseDragPayload(dataTransfer.getData("text/plain"));
}

export function hasTextDragPayload(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("text/plain");
}

import type { DragEvent } from "react";
import type { EnergyType } from "../../../../shared/src/types";

type DragPayload =
  | { kind: "hand-card"; handIndex: number }
  | { kind: "setup-hand"; handIndex: number }
  | { kind: "energy-token" }
  | { kind: "ability-energy"; energyType: EnergyType; sourceUmamusumeUid: number };

const TEXT_PREFIX = "umaduel:";
const ENERGY_TYPES: EnergyType[] = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "steel", "colorless", "dragon"];
let activeDragPreviewNode: HTMLElement | null = null;
let activeDragPreviewCleanup: (() => void) | null = null;

function encodeDragPayload(payload: DragPayload): string {
  switch (payload.kind) {
    case "hand-card":
      return `${TEXT_PREFIX}hand-card:${payload.handIndex}`;
    case "setup-hand":
      return `${TEXT_PREFIX}setup-hand:${payload.handIndex}`;
    case "energy-token":
      return `${TEXT_PREFIX}energy-token`;
    case "ability-energy":
      return `${TEXT_PREFIX}ability-energy:${payload.energyType}:${payload.sourceUmamusumeUid}`;
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
    const sourceUmamusumeUid = Number(parts[2]);
    return Number.isFinite(sourceUmamusumeUid) ? { kind: "ability-energy", energyType: value as EnergyType, sourceUmamusumeUid } : null;
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

export function applyDragPreview(event: DragEvent<Element>, options?: { width?: number; height?: number; maxWidth?: number; maxHeight?: number }) {
  const source = event.currentTarget;
  if (!(source instanceof HTMLElement)) return;

  const rect = source.getBoundingClientRect();
  const fixedWidth = options?.width;
  const fixedHeight = options?.height;
  const maxWidth = options?.maxWidth;
  const maxHeight = options?.maxHeight;
  let previewWidth = rect.width;
  let previewHeight = rect.height;
  if (fixedWidth && fixedHeight) {
    previewWidth = fixedWidth;
    previewHeight = fixedHeight;
  } else if (maxWidth || maxHeight) {
    const widthRatio = maxWidth ? maxWidth / previewWidth : Number.POSITIVE_INFINITY;
    const heightRatio = maxHeight ? maxHeight / previewHeight : Number.POSITIVE_INFINITY;
    const scale = Math.min(1, widthRatio, heightRatio);
    previewWidth = Math.max(1, Math.round(previewWidth * scale));
    previewHeight = Math.max(1, Math.round(previewHeight * scale));
  }
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.left = "-9999px";
  clone.style.top = "-9999px";
  clone.style.width = `${previewWidth}px`;
  clone.style.height = `${previewHeight}px`;
  clone.style.margin = "0";
  clone.style.pointerEvents = "none";
  clone.style.opacity = "1";
  clone.style.transform = "none";
  clone.style.zIndex = "2147483647";
  document.body.appendChild(clone);
  void clone.offsetHeight;

  const rawOffsetX = event.clientX - rect.left;
  const rawOffsetY = event.clientY - rect.top;
  const relativeX = rect.width > 0 ? rawOffsetX / rect.width : 0.5;
  const relativeY = rect.height > 0 ? rawOffsetY / rect.height : 0.5;
  const offsetX = Math.max(0, Math.min(previewWidth, relativeX * previewWidth));
  const offsetY = Math.max(0, Math.min(previewHeight, relativeY * previewHeight));
  event.dataTransfer.setDragImage(clone, offsetX, offsetY);
  attachDragPreviewCleanup(source, clone);
}

function attachDragPreviewCleanup(source: HTMLElement, previewNode: HTMLElement) {
  if (activeDragPreviewCleanup) activeDragPreviewCleanup();
  activeDragPreviewNode = previewNode;

  let cleaned = false;
  let timeoutId: number | null = null;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    source.removeEventListener("dragend", cleanup);
    window.removeEventListener("drop", cleanup);
    window.removeEventListener("dragend", cleanup);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    if (activeDragPreviewNode === previewNode) activeDragPreviewNode = null;
    previewNode.remove();
    if (activeDragPreviewCleanup === cleanup) activeDragPreviewCleanup = null;
  };

  source.addEventListener("dragend", cleanup, { once: true });
  window.addEventListener("drop", cleanup, { once: true });
  window.addEventListener("dragend", cleanup, { once: true });
  timeoutId = window.setTimeout(cleanup, 2000);
  activeDragPreviewCleanup = cleanup;
}

import { CardFlowOverlay } from "./CardFlowOverlay";

export function ShuffleCardReveal({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  return (
    <CardFlowOverlay
      items={[{
        cardId,
        label: "Card drawn",
        group: "drawn",
        enterFrom: "rightDiscard",
        exitTo: "leftDeck",
      }]}
      onDone={onDone}
    />
  );
}

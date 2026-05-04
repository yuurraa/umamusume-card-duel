import { CardFlowOverlay } from "./CardFlowOverlay";

export function ShuffleCardReveal({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  return (
    <CardFlowOverlay
      items={[{
        cardId,
        label: "Card retrieved",
        group: "retrieved",
        enterFrom: "rightDiscard",
        exitTo: "leftDeck",
      }]}
      onDone={onDone}
    />
  );
}

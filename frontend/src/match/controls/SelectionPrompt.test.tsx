import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectionPrompt } from "./SelectionPrompt";

function renderPrompt(pending: Parameters<typeof SelectionPrompt>[0]["pending"]) {
  return render(
    <SelectionPrompt
      pending={pending}
      onCancel={vi.fn()}
      nextEnergyType={null}
    />,
  );
}

describe("SelectionPrompt", () => {
  it("keeps Cancel for hand-card selections that have not been committed", () => {
    const view = renderPrompt({ kind: "rainbowUncapEvolution", handIndex: 2, umamusumeUid: 14 });
    expect(view.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("shows mandatory attack target guidance without a Cancel action", () => {
    const view = renderPrompt({ kind: "attackHealTarget" });
    expect(view.getByText("Choose 1 of your damaged Umamusume to heal.")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("shows mandatory ability target guidance without a Cancel action", () => {
    const view = renderPrompt({ kind: "abilityDamageTarget", abilityUmamusumeUid: 14 });
    expect(view.getByText("Choose 1 of your opponent's Umamusume to damage.")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});

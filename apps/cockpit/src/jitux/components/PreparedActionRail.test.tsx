import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PreparedAction } from "../types";
import { PreparedActionRail } from "./PreparedActionRail";

afterEach(() => {
  cleanup();
});

const actions: PreparedAction[] = [
  {
    id: "show-evidence",
    label: "Show evidence",
    command: "jitux.evidence.preview",
    safety: "read_only",
    ready: true,
    requiresApproval: false,
    reason: "Read-only preview.",
  },
  {
    id: "open-replay",
    label: "Open replay",
    command: "jitux.replay.open",
    safety: "bounded_auto",
    ready: true,
    requiresApproval: false,
    reason: "Bounded automatic replay.",
  },
  {
    id: "prepare-approval",
    label: "Prepare approval",
    command: "jitux.approval.prepare",
    safety: "approval_required",
    ready: true,
    requiresApproval: true,
    reason: "Needs human approval.",
  },
];

describe("PreparedActionRail", () => {
  it("renders actions across safety states with correct executability", () => {
    render(<PreparedActionRail actions={actions} />);

    const rail = screen.getByRole("region", { name: "Prepared actions" });
    expect(rail).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);

    const [readOnly, boundedAuto, approval] = buttons;
    expect(readOnly).toHaveClass("prepared-action-read_only");
    expect(boundedAuto).toHaveClass("prepared-action-bounded_auto");
    expect(approval).toHaveClass("prepared-action-approval_required");

    // read_only + bounded_auto are ready and executable.
    expect(readOnly).not.toBeDisabled();
    expect(boundedAuto).not.toBeDisabled();
    // approval_required requires approval -> not executable, shows the safety label.
    expect(approval).toBeDisabled();
    expect(screen.getByText("approval required")).toBeInTheDocument();
    expect(screen.getAllByText("ready")).toHaveLength(2);
  });

  it("renders nothing when there are no prepared actions", () => {
    render(<PreparedActionRail actions={[]} />);

    expect(screen.getByRole("region", { name: "Prepared actions" })).toBeEmptyDOMElement();
  });
});

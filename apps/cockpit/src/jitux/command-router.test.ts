import { describe, expect, it } from "vitest";
import { routeNowCommand } from "./command-router";

describe("Now command router", () => {
  it.each([
    "Jeryu",
    "Jeryu info",
    "show me info on Jeryu",
    "show Jeryu status",
    "show Jeryu health",
    "show Jeryu repos",
    "show Jankurai scores",
    "Jeryu status",
    "Jeryu health",
  ])("routes %s to the active Jeryu scene", (prompt) => {
    expect(routeNowCommand(prompt).intent).toBe("jeryu");
  });

  it.each(["Show me what you can do", "update me on the system", "status report"])(
    "routes broad status request %s to system report",
    (prompt) => {
      expect(routeNowCommand(prompt).intent).toBe("system_report");
    },
  );

  it("routes graph, task, action, and repo-create prompts to governed scenes", () => {
    expect(routeNowCommand("show a graph on this code base").intent).toBe("code_graph");
    expect(routeNowCommand("ask for a new task").intent).toBe("task_intake");
    expect(routeNowCommand("Please do a bug audit on the repo bank").intent).toBe("bug_audit");
    expect(routeNowCommand("Please run a Jailgun improvement on the JMCP frontend").intent).toBe("jailgun_frontend_improvement");
    expect(routeNowCommand("I want to start a fresh repo named alpha-lab").intent).toBe("repo_create");
  });
});

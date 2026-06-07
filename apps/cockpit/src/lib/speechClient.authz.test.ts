import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribe } from "./speechClient";

interface ResponseLike {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

type FetchSignature = (input: string, init?: RequestInit) => Promise<ResponseLike>;

function jsonResponse(value: unknown): ResponseLike {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(value),
  };
}

describe("speechClient ASR authz boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not send authorization or cookie headers to the ASR sidecar", async () => {
    const fetchDouble = vi.fn<FetchSignature>(() => Promise.resolve(jsonResponse({ text: "ready" })));
    vi.stubGlobal("fetch", fetchDouble);

    await transcribe(new Blob(["audio"], { type: "audio/webm" }));

    const headers = fetchDouble.mock.calls[0]?.[1]?.headers;
    expect(headers).toEqual({ "content-type": "audio/webm" });
    expect(JSON.stringify(headers).toLowerCase()).not.toContain("authorization");
    expect(JSON.stringify(headers).toLowerCase()).not.toContain("cookie");
  });
});

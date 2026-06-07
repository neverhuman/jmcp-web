import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VoiceAssistant from "./components/VoiceAssistant";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("test api unavailable"))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("VoiceAssistant widget", () => {
  let savedMediaDevices: MediaDevices | undefined;
  let savedSecureContext: boolean | undefined;
  let savedMediaRecorder: typeof MediaRecorder | undefined;

  beforeEach(() => {
    savedMediaDevices = navigator.mediaDevices;
    savedSecureContext = window.isSecureContext;
    savedMediaRecorder = window.MediaRecorder;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: savedMediaDevices,
    });
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: savedSecureContext,
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: savedMediaRecorder,
    });
  });

  it("renders only the compact unavailable control without a microphone", () => {
    render(<VoiceAssistant />);

    expect(screen.getByRole("status", { name: "Voice unavailable" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Type a command for JMCP")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(screen.queryByText("Voice off")).not.toBeInTheDocument();
  });

  it("shows a useful message when Chrome reports no microphone device", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: class MediaRecorderDouble {
        static isTypeSupported() {
          return true;
        }
      },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn(() => Promise.resolve([])),
        getUserMedia: vi.fn(() =>
          Promise.reject(new DOMException("Requested device not found", "NotFoundError")),
        ),
      },
    });

    render(<VoiceAssistant />);
    await user.click(screen.getByRole("button", { name: "Start voice assistant" }));

    expect(
      await screen.findByRole("button", {
        name: /Voice error: Chrome cannot see a microphone input/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Type a command for JMCP")).not.toBeInTheDocument();
  });
});

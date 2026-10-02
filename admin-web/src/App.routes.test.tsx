// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { ApiFailure, request } from "./api";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  request: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const requestMock = vi.mocked(request);
const report = {
  id: "a",
  communityId: "synthetic",
  communityHost: "synthetic.invalid",
  reporterPubkey: "21".repeat(32),
  targetKind: "event",
  target: "12".repeat(32),
  reportType: "spam",
  note: "Synthetic private report A",
  status: "open",
  createdAt: "2026-10-01T12:00:00Z",
};
const feedback = {
  id: "a",
  communityId: "synthetic",
  communityHost: "synthetic.invalid",
  eventId: "31".repeat(32),
  submitterPubkey: "21".repeat(32),
  category: "needs-work",
  body: "Synthetic private feedback A",
  tags: [],
  eventCreatedAt: "2026-10-01T12:00:00Z",
  receivedAt: "2026-10-01T12:01:00Z",
};

for (const kind of ["reports", "feedback"] as const) {
  for (const status of [403, 404]) {
    test(`${kind}: navigating from loaded A to pending/denied B never displays A`, async () => {
      let rejectB!: (error: Error) => void;
      const pending = new Promise((_resolve, reject) => {
        rejectB = reject;
      });
      requestMock.mockImplementation(async (path) => {
        if (path === `/${kind}/a`)
          return kind === "reports" ? report : feedback;
        if (path === `/${kind}/b`) return pending;
        throw new Error(`Unexpected synthetic request ${path}`);
      });
      history.replaceState(null, "", `/${kind}/a`);
      render(<App />);
      const body = kind === "reports" ? report.note : feedback.body;
      expect(await screen.findByText(body)).toBeTruthy();
      act(() => {
        history.pushState(null, "", `/${kind}/b`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(screen.queryByText(body)).toBeNull();
      expect(screen.getByRole("status").textContent).toBe("Loading…");
      await act(async () =>
        rejectB(new ApiFailure(status, "Synthetic B unavailable")),
      );
      expect(screen.queryByText(body)).toBeNull();
      expect(
        screen.getByRole("heading", {
          name: status === 403 ? "Access denied" : "Could not load data",
        }),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });
  }
}

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";
import type { Resource } from "./useResource";

const fixture = vi.hoisted(() => ({ resource: {} as Resource<unknown> }));
vi.mock("./useResource", () => ({ useResource: () => fixture.resource }));
afterEach(cleanup);
function resource(overrides: Partial<Resource<unknown>>) {
  history.replaceState(null, "", "/reports");
  fixture.resource = {
    data: [],
    loading: false,
    stale: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

test("same-key refresh failure announces retained data and exposes a working retry", () => {
  const refetch = vi.fn();
  resource({
    error: new Error("Synthetic refresh unavailable"),
    stale: true,
    refetch,
  });
  render(<App />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Could not refresh data",
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "Showing previous data",
  );
  expect(screen.getByText("No records.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(refetch).toHaveBeenCalledOnce();
});

test("same-key refresh announces loading while retaining existing content", () => {
  resource({ loading: true, stale: true });
  render(<App />);
  expect(screen.getByRole("status").textContent).toContain("Refreshing");
  expect(screen.getByText("No records.")).toBeTruthy();
});

// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, expect, test } from "vitest";
import { useResource } from "./useResource";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(cleanup);

test("a new key hides old data on the first committed render, then exposes its failure", async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const commits: Array<{
    key: string;
    data?: string;
    error?: Error;
    loading: boolean;
  }> = [];
  const { result, rerender } = renderHook(
    ({ key }) => {
      const resource = useResource(
        () => (key === "a" ? a.promise : b.promise),
        key,
      );
      useLayoutEffect(() => {
        commits.push({ key, ...resource });
      });
      return resource;
    },
    { initialProps: { key: "a" } },
  );
  await act(async () => a.resolve("private record A"));
  expect(result.current.data).toBe("private record A");
  rerender({ key: "b" });
  expect(commits.find((commit) => commit.key === "b")).toMatchObject({
    data: undefined,
    error: undefined,
    loading: true,
  });
  await act(async () => b.reject(new Error("Access denied for B")));
  expect(result.current.data).toBeUndefined();
  expect(result.current.error?.message).toBe("Access denied for B");
  expect(result.current.loading).toBe(false);
});

test("key changes hide old errors while a new request is pending", async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const { result, rerender } = renderHook(
    ({ key }) => useResource(() => (key === "a" ? a.promise : b.promise), key),
    { initialProps: { key: "a" } },
  );
  await act(async () => a.reject(new Error("A not found")));
  rerender({ key: "b" });
  expect(result.current.error).toBeUndefined();
  expect(result.current.loading).toBe(true);
});

test("late responses cannot overwrite a new key or a later request for the same key", async () => {
  const oldA = deferred<string>();
  const b = deferred<string>();
  const newA = deferred<string>();
  let requestsA = 0;
  const { result, rerender } = renderHook(
    ({ key }) =>
      useResource(
        () =>
          key === "a"
            ? requestsA++ === 0
              ? oldA.promise
              : newA.promise
            : b.promise,
        key,
      ),
    { initialProps: { key: "a" } },
  );
  rerender({ key: "b" });
  await act(async () => b.resolve("B"));
  expect(result.current.data).toBe("B");
  rerender({ key: "a" });
  await act(async () => oldA.resolve("obsolete A"));
  expect(result.current.data).toBeUndefined();
  expect(result.current.loading).toBe(true);
  await act(async () => newA.resolve("current A"));
  expect(result.current.data).toBe("current A");
});

test("same-key refresh retains data with explicit failure and succeeds on retry", async () => {
  const first = deferred<string>();
  const refresh = deferred<string>();
  const retry = deferred<string>();
  const requests = [first, refresh, retry];
  let index = 0;
  const { result } = renderHook(() =>
    useResource(() => requests[index++].promise, "a"),
  );
  await act(async () => first.resolve("retained A"));
  act(() => result.current.refetch());
  expect(result.current.data).toBe("retained A");
  expect(result.current.stale).toBe(true);
  await act(async () => refresh.reject(new Error("Refresh failed")));
  expect(result.current.data).toBe("retained A");
  expect(result.current.error?.message).toBe("Refresh failed");
  expect(result.current.stale).toBe(true);
  act(() => result.current.refetch());
  await act(async () => retry.resolve("fresh A"));
  expect(result.current.data).toBe("fresh A");
  expect(result.current.error).toBeUndefined();
  expect(result.current.stale).toBe(false);
});

test("a late old-key failure cannot contaminate the current successful record", async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const { result, rerender } = renderHook(
    ({ key }) => useResource(() => (key === "a" ? a.promise : b.promise), key),
    { initialProps: { key: "a" } },
  );
  rerender({ key: "b" });
  await act(async () => b.resolve("current B"));
  await act(async () => a.reject(new Error("obsolete A failure")));
  expect(result.current.data).toBe("current B");
  expect(result.current.error).toBeUndefined();
  expect(result.current.loading).toBe(false);
});

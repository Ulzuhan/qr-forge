import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", { location: { assign: vi.fn(), reload: vi.fn() }, history: { back: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

it("refreshes the current route", async () => {
  const { useNavigation } = await import("./navigation");
  useNavigation().refresh();
  expect(window.location.reload).toHaveBeenCalledOnce();
});
it("does not cancel a navigation with a subsequent refresh", async () => {
  const { useNavigation } = await import("./navigation");
  const navigation = useNavigation();
  navigation.push("/new-code"); navigation.refresh();
  expect(window.location.assign).toHaveBeenCalledWith("/new-code");
  expect(window.location.reload).not.toHaveBeenCalled();
});
it("does not cancel back navigation", async () => {
  const { useNavigation } = await import("./navigation");
  const navigation = useNavigation();
  navigation.back(); navigation.refresh();
  expect(window.history.back).toHaveBeenCalledOnce();
  expect(window.location.reload).not.toHaveBeenCalled();
});

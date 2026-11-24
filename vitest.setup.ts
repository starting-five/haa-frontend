import "@testing-library/jest-dom/vitest";

// Unit tests import modules outside a Next build, so they get a stand-in host.
// CI declares the variable for the whole workflow (empty until the repository
// variable is set), so an empty value counts as unset here. This is only the
// tests' value: a build without a real host is refused by next.config.ts, and
// src/release/__tests__/public-build-env.test.ts keeps the build passing it.
if (!process.env.NEXT_PUBLIC_AMBASSADOR_LINK_HOST?.trim()) {
  process.env.NEXT_PUBLIC_AMBASSADOR_LINK_HOST = "go.test.helpafteraccident.com";
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function ensureStorage(name: "localStorage" | "sessionStorage") {
  let storage: Storage | undefined;
  try {
    storage = window[name];
    storage?.getItem("__probe__");
  } catch {
    storage = undefined;
  }

  if (storage) return;

  const memoryStorage = createMemoryStorage();
  Object.defineProperty(window, name, { value: memoryStorage, configurable: true });
  Object.defineProperty(globalThis, name, { value: memoryStorage, configurable: true });
}

if (typeof window !== "undefined") {
  ensureStorage("localStorage");
  ensureStorage("sessionStorage");
}

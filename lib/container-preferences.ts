function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  const storage = window.localStorage;

  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) {
    return null;
  }

  return storage;
}

export const CONTAINER_ALIAS_STORAGE_KEY =
  "vercelab:containers-friendly-labels";

export function readStoredContainerAliases() {
  const rawValue = getStorage()?.getItem(CONTAINER_ALIAS_STORAGE_KEY);

  if (!rawValue) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {} as Record<string, string>;
  }
}

export function writeStoredContainerAliases(aliases: Record<string, string>) {
  getStorage()?.setItem(CONTAINER_ALIAS_STORAGE_KEY, JSON.stringify(aliases));
}
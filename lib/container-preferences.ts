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

const CONTAINER_ALIASES_EVENT = "vercelab:container-aliases-changed";

function parseStoredContainerAliases(rawValue: string | null | undefined) {
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

export function readStoredContainerAliases() {
  return parseStoredContainerAliases(
    getStorage()?.getItem(CONTAINER_ALIAS_STORAGE_KEY),
  );
}

export function writeStoredContainerAliases(aliases: Record<string, string>) {
  getStorage()?.setItem(CONTAINER_ALIAS_STORAGE_KEY, JSON.stringify(aliases));

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CONTAINER_ALIASES_EVENT));
  }
}

export function subscribeToStoredContainerAliases(
  onAliasesChange: (aliases: Record<string, string>) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleChange = () => {
    onAliasesChange(readStoredContainerAliases());
  };

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== null &&
      event.key !== CONTAINER_ALIAS_STORAGE_KEY
    ) {
      return;
    }

    onAliasesChange(parseStoredContainerAliases(event.newValue));
  };

  window.addEventListener(CONTAINER_ALIASES_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CONTAINER_ALIASES_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}
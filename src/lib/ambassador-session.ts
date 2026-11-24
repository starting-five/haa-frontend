const AMBASSADOR_KEY_PREFIX = "onboarding_ambassador_";

export function clearAmbassadorSession(storage: Storage): void {
  for (const key of Object.keys(storage).filter((key) => key.startsWith(AMBASSADOR_KEY_PREFIX))) {
    storage.removeItem(key);
  }
}

const INTAKE_KEY_PREFIX = "intake_";
const INTAKE_RESUME_DRAFT_KEY = "patient_intake_resume_draft";
/**
 * The Supabase user the tab's intake state belongs to, written the moment a
 * number is verified. Answers, the case id and the submitted marker all live in
 * the tab, and the tab outlives an account: deleted in the dashboard, or signed
 * out without the app's own controls, the next patient on the same tab and the
 * same number was shown the previous one's name and filed under it. The owner
 * is what lets the flow tell the two people apart — the phone cannot, a number
 * can come back as a different account.
 */
export const INTAKE_OWNER_KEY = "intake_ownerUserId";

const INTAKE_RESUME_FIELDS = [
  "intake_firstName",
  "intake_lastName",
  "intake_phone",
  "intake_email",
  "intake_submissionId",
  INTAKE_OWNER_KEY,
] as const;

type IntakeResumeDraft = Partial<Record<(typeof INTAKE_RESUME_FIELDS)[number], string>>;
type IntakeAuthIdentity = {
  phone?: string | null;
  email?: string | null;
  userMetadata?: unknown;
};

/**
 * The only intake values the flow still needs once the case has been submitted.
 *
 * Everything else the patient entered is transient: it exists to carry answers
 * between screens and to build the submit payload, and the backend owns it from
 * that point on. Clearing it stops a later visitor to the same tab seeing the
 * previous patient's answers.
 *
 * These two are different:
 *
 *   intake_submissionId — the post-submit flow is built on it. hire-attorney
 *     guards on it and sends it to the agreement endpoint, connected guards on
 *     it, the DocuSign return route reads it to ask for the real status, and
 *     the dashboard uses it to load the case. Dropping it stranded a patient
 *     who had just submitted: the guard bounced them and the cascade put them
 *     back at the start of intake.
 *
 *   intake_firstName, intake_lastName — still kept, but no post-submit screen
 *     reads them. The dashboard greets with the name GET /patient/dashboard
 *     returns, which also covers a patient who signed in on a tab that never
 *     ran intake.
 *
 * This is navigation state, never authorization. Holding a submission id
 * proves nothing; the backend re-resolves the patient on every agreement
 * request through lib/patient-identity.ts and that remains the only authority.
 */
export const POST_SUBMIT_SESSION_KEYS = ["intake_submissionId", "intake_firstName", "intake_lastName"] as const;

/**
 * Written by the cleanup below once a case has been submitted. The answers
 * are gone by then, so a pre-submit screen reached through the browser's Back
 * cannot show anything; the marker lets its guard forward to the post-submit
 * flow instead of bouncing to the step before it and cascading back to the
 * start of intake (see hooks/use-require-session-key.ts).
 */
export const INTAKE_SUBMITTED_KEY = "intake_submitted";

/**
 * Clears every intake value, the submission id and the submitted marker
 * included, for a patient deliberately starting a new intake. The entry screens
 * restore stored answers, and a leftover submission id with its marker would
 * forward the new flow's guards into the previous case's post-submit screens
 * (see hooks/use-require-session-key.ts). Keys that belong to other features
 * are left alone.
 */
export function clearIntakeSession(storage: Storage): void {
  for (const key of Object.keys(storage).filter((key) => key.startsWith(INTAKE_KEY_PREFIX))) {
    storage.removeItem(key);
  }
}

function normalizePhoneForMatch(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

/**
 * Saves enough pre-submit intake state to restore the same patient's draft
 * after they sign out and back in. A submitted case is not a draft: that patient
 * signs back in to the dashboard, which reads the case from the backend, so
 * nothing of it is kept for whoever uses the tab next.
 */
export function preserveIntakeResumeDraft(storage: Storage): void {
  if (storage.getItem(INTAKE_SUBMITTED_KEY)) {
    storage.removeItem(INTAKE_RESUME_DRAFT_KEY);
    return;
  }

  const snapshot = INTAKE_RESUME_FIELDS.reduce<IntakeResumeDraft>((draft, key) => {
    const value = storage.getItem(key)?.trim() ?? "";
    if (value) draft[key] = value;
    return draft;
  }, {});

  if (Object.keys(snapshot).length === 0) {
    storage.removeItem(INTAKE_RESUME_DRAFT_KEY);
    return;
  }

  storage.setItem(INTAKE_RESUME_DRAFT_KEY, JSON.stringify(snapshot));
}

export function clearIntakeResumeDraft(storage: Storage): void {
  storage.removeItem(INTAKE_RESUME_DRAFT_KEY);
}

/**
 * Whether this tab holds a draft preserved at sign-out for exactly this phone —
 * a patient who passed verification here and stopped before submitting.
 */
export function hasIntakeResumeDraftFor(storage: Storage, phone: string): boolean {
  try {
    const draft = JSON.parse(storage.getItem(INTAKE_RESUME_DRAFT_KEY) ?? "null") as IntakeResumeDraft | null;
    const savedPhone = draft?.intake_phone ?? "";
    return Boolean(savedPhone) && normalizePhoneForMatch(savedPhone) === normalizePhoneForMatch(phone);
  } catch {
    return false;
  }
}

/**
 * Restores a preserved draft only when it belongs to the account that just
 * authenticated: the same user, and the same phone number. A draft saved before
 * drafts carried their owner cannot be attributed, and is dropped.
 */
export function restoreIntakeResumeDraft(
  storage: Storage,
  authenticatedPhone: string,
  authenticatedUserId: string
): boolean {
  const raw = storage.getItem(INTAKE_RESUME_DRAFT_KEY);
  if (!raw) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(INTAKE_RESUME_DRAFT_KEY);
    return false;
  }

  if (!parsed || typeof parsed !== "object") {
    storage.removeItem(INTAKE_RESUME_DRAFT_KEY);
    return false;
  }

  const draft = parsed as IntakeResumeDraft;
  const savedPhone = draft.intake_phone ?? "";
  if (!savedPhone) return false;

  if (normalizePhoneForMatch(savedPhone) !== normalizePhoneForMatch(authenticatedPhone)) {
    return false;
  }

  if (!authenticatedUserId || draft[INTAKE_OWNER_KEY] !== authenticatedUserId) {
    storage.removeItem(INTAKE_RESUME_DRAFT_KEY);
    return false;
  }

  for (const key of INTAKE_RESUME_FIELDS) {
    const value = draft[key]?.trim() ?? "";
    if (value) storage.setItem(key, value);
  }

  return true;
}

/**
 * Chooses the furthest safe intake step from the local draft state.
 */
export function getIntakeResumePath(storage: Storage, locale: string): string {
  const submissionId = storage.getItem("intake_submissionId")?.trim() ?? "";
  if (submissionId) return `/${locale}/intake/incident`;

  const firstName = storage.getItem("intake_firstName")?.trim() ?? "";
  if (firstName) return `/${locale}/intake/phone`;

  return `/${locale}/intake`;
}

function metadataString(metadata: unknown, ...keys: string[]): string {
  if (!metadata || typeof metadata !== "object") return "";
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Seeds intake identity fields from the authenticated user when local intake
 * draft data is missing.
 */
export function seedIntakeIdentityFromAuth(storage: Storage, identity: IntakeAuthIdentity): void {
  const phone = identity.phone?.trim() ?? "";
  const email = identity.email?.trim() ?? "";
  const firstName = metadataString(identity.userMetadata, "first_name", "firstName", "given_name");
  const lastName = metadataString(identity.userMetadata, "last_name", "lastName", "family_name");

  if (phone && !storage.getItem("intake_phone")?.trim()) storage.setItem("intake_phone", phone);
  if (email && !storage.getItem("intake_email")?.trim()) storage.setItem("intake_email", email);
  if (firstName && !storage.getItem("intake_firstName")?.trim()) storage.setItem("intake_firstName", firstName);
  if (lastName && !storage.getItem("intake_lastName")?.trim()) storage.setItem("intake_lastName", lastName);
}

/**
 * Clears the transient intake answers, keeping the values the post-submit flow
 * still needs. Call only after the submission has actually succeeded — on
 * failure the patient stays on the review screen with their answers intact.
 */
export function clearIntakeSessionAfterSubmit(storage: Storage): void {
  const preserved = [...POST_SUBMIT_SESSION_KEYS, INTAKE_OWNER_KEY].map(
    (key) => [key, storage.getItem(key)?.trim() ?? ""] as const
  );

  clearIntakeSession(storage);

  // A key that was absent or blank stays absent — nothing is invented here.
  for (const [key, value] of preserved) {
    if (value) storage.setItem(key, value);
  }

  // Only a real submission gets the marker; a cleanup with no id has nothing
  // for the post-submit screens to continue with.
  if (storage.getItem("intake_submissionId")) storage.setItem(INTAKE_SUBMITTED_KEY, "1");
}

/** What the tab may still hold of an intake that a number was verified for. */
function holdsVerifiedIntake(storage: Storage): boolean {
  return Boolean(storage.getItem("intake_submissionId") || storage.getItem(INTAKE_SUBMITTED_KEY));
}

/**
 * For the intake's entry screens, before they show anything stored: lets go of
 * intake state that belongs to someone other than the account signed in now.
 *
 * `currentUserId` is the user the server confirms for this browser, or null when
 * there is none — signed out, or an account that no longer exists. State owned by
 * another user is cleared; so is a case id or submitted marker that has no owner
 * (written before owners were recorded) while nobody is signed in. A tab whose
 * owner is the current user is left alone, and an unowned one that a signed-in
 * user is carrying is stamped as theirs. The resume draft is untouched: it is
 * restored only for its own user (restoreIntakeResumeDraft).
 *
 * Returns whether anything was cleared, so a screen can reset what it shows.
 */
export function releaseIntakeFromOtherUser(storage: Storage, currentUserId: string | null): boolean {
  const owner = storage.getItem(INTAKE_OWNER_KEY)?.trim() ?? "";

  if (owner ? owner !== currentUserId : holdsVerifiedIntake(storage) && !currentUserId) {
    clearIntakeSession(storage);
    return true;
  }

  if (!owner && currentUserId && holdsVerifiedIntake(storage)) storage.setItem(INTAKE_OWNER_KEY, currentUserId);
  return false;
}

/**
 * Called the moment a number is verified, with the account it verified as. Intake
 * state belonging to a different user is cleared before anything reads it — the
 * case id and submitted marker above all, which would otherwise forward the new
 * account into the previous one's case — and the tab is stamped as this user's.
 *
 * `keepEnteredIdentity` keeps the name, phone and email typed on the screens
 * before the code: the intake's own code screen is about to open the case with
 * them. Patient login has typed none of these, and clears everything.
 */
export function claimIntakeForUser(
  storage: Storage,
  userId: string,
  { keepEnteredIdentity }: { keepEnteredIdentity: boolean }
): void {
  const owner = storage.getItem(INTAKE_OWNER_KEY)?.trim() ?? "";

  if ((owner && owner !== userId) || (!owner && holdsVerifiedIntake(storage))) {
    const entered = keepEnteredIdentity
      ? (["intake_firstName", "intake_lastName", "intake_phone", "intake_email"] as const).map(
          (key) => [key, storage.getItem(key)] as const
        )
      : [];
    clearIntakeSession(storage);
    for (const [key, value] of entered) if (value) storage.setItem(key, value);
  }

  storage.setItem(INTAKE_OWNER_KEY, userId);
}

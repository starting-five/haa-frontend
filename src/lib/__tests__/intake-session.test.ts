import { beforeEach, describe, expect, it } from "vitest";

import {
  claimIntakeForUser,
  clearIntakeResumeDraft,
  getIntakeResumePath,
  INTAKE_OWNER_KEY,
  INTAKE_SUBMITTED_KEY,
  POST_SUBMIT_SESSION_KEYS,
  clearIntakeSession,
  clearIntakeSessionAfterSubmit,
  preserveIntakeResumeDraft,
  releaseIntakeFromOtherUser,
  restoreIntakeResumeDraft,
  seedIntakeIdentityFromAuth,
} from "@/lib/intake-session";

// The regression these cover: the cleanup that runs after a successful submit
// used to drop every intake_* key except the first name, taking
// intake_submissionId with it. The patient had a real submission, but
// hire-attorney guarded on an id that was no longer there, bounced them, and
// the guard cascade returned them to the start of intake — so the agreement
// could never be reached through the real flow.

const submittedIntakeState: Record<string, string> = {
  intake_submissionId: "eee0b2d0-2362-494c-a890-eb1e9931fe33",
  intake_firstName: "Sandbox",
  intake_lastName: "TestPatient",
  intake_phone: "+15550198642",
  intake_email: "patient@example.test",
  intake_incidentType: "car",
  intake_incidentDate: "2026-09-05",
  intake_incidentLocation: "Los Angeles, CA",
  intake_description: "rear-ended at a stop light",
  intake_injuries: '{"selected":["headNeck"]}',
  intake_residence: "Los Angeles, CA",
  intake_treatmentArea: "Los Angeles, CA",
  intake_role: "driver",
  intake_documents: "[]",
  intake_choosePath: "guideMe",
  intake_fault: "no",
};

function seed(state: Record<string, string>) {
  sessionStorage.clear();
  for (const [key, value] of Object.entries(state)) sessionStorage.setItem(key, value);
}

describe("intake session lifecycle after submit", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("keeps the submission id so the post-submit flow can reach the agreement", () => {
    seed(submittedIntakeState);

    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(sessionStorage.getItem("intake_submissionId")).toBe(submittedIntakeState.intake_submissionId);
  });

  it("keeps the first name the dashboard greets with", () => {
    seed(submittedIntakeState);

    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(sessionStorage.getItem("intake_firstName")).toBe("Sandbox");
  });

  it("clears every transient intake answer", () => {
    seed(submittedIntakeState);

    clearIntakeSessionAfterSubmit(sessionStorage);

    const transient = Object.keys(submittedIntakeState).filter(
      (key) => !(POST_SUBMIT_SESSION_KEYS as readonly string[]).includes(key)
    );
    expect(transient.length).toBeGreaterThan(0);
    for (const key of transient) {
      expect(sessionStorage.getItem(key)).toBeNull();
    }
  });

  it("leaves exactly the post-submit keys and the submitted marker behind", () => {
    seed(submittedIntakeState);

    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(Object.keys(sessionStorage).sort()).toEqual([...POST_SUBMIT_SESSION_KEYS, INTAKE_SUBMITTED_KEY].sort());
  });

  it("marks the case submitted so pre-submit screens forward instead of cascading back", () => {
    seed(submittedIntakeState);

    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(sessionStorage.getItem(INTAKE_SUBMITTED_KEY)).toBe("1");
  });

  it("sets no submitted marker when there was no submission to continue with", () => {
    seed({ intake_firstName: "Sandbox", intake_phone: "+15550198642" });

    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(sessionStorage.getItem(INTAKE_SUBMITTED_KEY)).toBeNull();
  });

  it("does not touch keys belonging to other features", () => {
    seed({ ...submittedIntakeState, "sb-auth-token": "unrelated", theme: "dark" });

    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(sessionStorage.getItem("sb-auth-token")).toBe("unrelated");
    expect(sessionStorage.getItem("theme")).toBe("dark");
  });

  it("invents no submission id when one was never stored", () => {
    // A submit that failed before /intake/start, or a tab with no flow state:
    // the cleanup must not fabricate an id the backend would then reject.
    seed({ intake_firstName: "Sandbox", intake_phone: "+15550198642" });

    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
    expect(Object.keys(sessionStorage)).toEqual(["intake_firstName"]);
  });

  it("drops a blank submission id rather than preserving an empty string", () => {
    seed({ intake_submissionId: "   ", intake_firstName: "Sandbox" });

    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
  });

  it("is idempotent, so a repeated cleanup cannot strand the patient", () => {
    seed(submittedIntakeState);

    clearIntakeSessionAfterSubmit(sessionStorage);
    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(sessionStorage.getItem("intake_submissionId")).toBe(submittedIntakeState.intake_submissionId);
    expect(sessionStorage.getItem("intake_firstName")).toBe("Sandbox");
  });

  it("preserves the id hire-attorney guards on and the return route reads", () => {
    // Both screens key off intake_submissionId; if the constant ever stops
    // listing it, those screens silently break rather than failing loudly.
    expect(POST_SUBMIT_SESSION_KEYS).toContain("intake_submissionId");
  });
});

describe("clearing the intake for a new start", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  const intakeKeys = () => Object.keys(sessionStorage).filter((key) => key.startsWith("intake_"));

  it("removes every intake value, the submission id and the submitted marker", () => {
    sessionStorage.setItem("intake_firstName", "Ada");
    sessionStorage.setItem("intake_phone", "+15550001111");
    sessionStorage.setItem("intake_incidentLocationDetails", "{}");
    sessionStorage.setItem("intake_submissionId", "sub-1");
    sessionStorage.setItem(INTAKE_SUBMITTED_KEY, "1");

    clearIntakeSession(sessionStorage);

    expect(intakeKeys()).toEqual([]);
  });

  it("does not touch keys belonging to other features", () => {
    sessionStorage.setItem("intake_firstName", "Ada");
    sessionStorage.setItem("patient_login_phone", "+15550001111");
    sessionStorage.setItem("getHelp:selectedLocale", "es");
    sessionStorage.setItem("onboarding_ambassador_username", "ada");

    clearIntakeSession(sessionStorage);

    expect(sessionStorage.getItem("patient_login_phone")).toBe("+15550001111");
    expect(sessionStorage.getItem("getHelp:selectedLocale")).toBe("es");
    expect(sessionStorage.getItem("onboarding_ambassador_username")).toBe("ada");
  });

  it("is safe to repeat", () => {
    sessionStorage.setItem("intake_submissionId", "sub-1");

    clearIntakeSession(sessionStorage);
    clearIntakeSession(sessionStorage);

    expect(intakeKeys()).toEqual([]);
  });
});

describe("preserving and restoring an intake draft across logout/login", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("restores intake fields for the same account and phone number", () => {
    sessionStorage.setItem(INTAKE_OWNER_KEY, "user-ada");
    sessionStorage.setItem("intake_firstName", "Ada");
    sessionStorage.setItem("intake_lastName", "Lovelace");
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_email", "ada@example.test");
    sessionStorage.setItem("intake_submissionId", "sub-1");

    preserveIntakeResumeDraft(sessionStorage);
    clearIntakeSession(sessionStorage);

    expect(restoreIntakeResumeDraft(sessionStorage, "+1 (407) 555-1234", "user-ada")).toBe(true);
    expect(sessionStorage.getItem("intake_firstName")).toBe("Ada");
    expect(sessionStorage.getItem("intake_lastName")).toBe("Lovelace");
    expect(sessionStorage.getItem("intake_phone")).toBe("+14075551234");
    expect(sessionStorage.getItem("intake_email")).toBe("ada@example.test");
    expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-1");
  });

  it("does not restore draft data for a different phone number", () => {
    sessionStorage.setItem(INTAKE_OWNER_KEY, "user-ada");
    sessionStorage.setItem("intake_firstName", "Ada");
    sessionStorage.setItem("intake_phone", "+14075551234");

    preserveIntakeResumeDraft(sessionStorage);
    clearIntakeSession(sessionStorage);

    expect(restoreIntakeResumeDraft(sessionStorage, "+13105550123", "user-ada")).toBe(false);
    expect(sessionStorage.getItem("intake_firstName")).toBeNull();
    expect(sessionStorage.getItem("intake_phone")).toBeNull();
  });

  it("can explicitly discard the preserved draft", () => {
    sessionStorage.setItem("intake_firstName", "Ada");
    sessionStorage.setItem("intake_phone", "+14075551234");

    preserveIntakeResumeDraft(sessionStorage);
    clearIntakeResumeDraft(sessionStorage);
    clearIntakeSession(sessionStorage);

    expect(restoreIntakeResumeDraft(sessionStorage, "+14075551234", "user-ada")).toBe(false);
  });

  // The number came back as a different account (the first was deleted, or a
  // carrier reassigned it). The draft belongs to the old one and must not open.
  it("does not restore another account's draft for the same phone number, and drops it", () => {
    sessionStorage.setItem(INTAKE_OWNER_KEY, "user-old");
    sessionStorage.setItem("intake_firstName", "Ada");
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_submissionId", "sub-old");

    preserveIntakeResumeDraft(sessionStorage);
    clearIntakeSession(sessionStorage);

    expect(restoreIntakeResumeDraft(sessionStorage, "+14075551234", "user-new")).toBe(false);
    expect(sessionStorage.getItem("intake_firstName")).toBeNull();
    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
    expect(sessionStorage.getItem("patient_intake_resume_draft")).toBeNull();
  });

  it("drops a draft saved before drafts carried their owner", () => {
    sessionStorage.setItem(
      "patient_intake_resume_draft",
      JSON.stringify({ intake_firstName: "Ada", intake_phone: "+14075551234", intake_submissionId: "sub-old" })
    );

    expect(restoreIntakeResumeDraft(sessionStorage, "+14075551234", "user-new")).toBe(false);
    expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
    expect(sessionStorage.getItem("patient_intake_resume_draft")).toBeNull();
  });

  it("keeps no draft of a submitted case — that patient signs back in to the dashboard", () => {
    sessionStorage.setItem(INTAKE_OWNER_KEY, "user-ada");
    sessionStorage.setItem("intake_firstName", "Ada");
    sessionStorage.setItem("intake_phone", "+14075551234");
    sessionStorage.setItem("intake_submissionId", "sub-1");
    sessionStorage.setItem(INTAKE_SUBMITTED_KEY, "1");

    preserveIntakeResumeDraft(sessionStorage);

    expect(sessionStorage.getItem("patient_intake_resume_draft")).toBeNull();
  });

  it("resumes at incident when submission id is available", () => {
    sessionStorage.setItem("intake_submissionId", "sub-1");
    sessionStorage.setItem("intake_firstName", "Ada");
    expect(getIntakeResumePath(sessionStorage, "en")).toBe("/en/intake/incident");
  });

  it("resumes at phone when first name is known but no submission id exists", () => {
    sessionStorage.setItem("intake_firstName", "Ada");
    expect(getIntakeResumePath(sessionStorage, "en")).toBe("/en/intake/phone");
  });

  it("resumes at intake start when no draft fields exist", () => {
    expect(getIntakeResumePath(sessionStorage, "en")).toBe("/en/intake");
  });

  it("seeds missing intake identity fields from auth metadata", () => {
    seedIntakeIdentityFromAuth(sessionStorage, {
      phone: "+14075551234",
      email: "ada@example.test",
      userMetadata: { first_name: "Ada", last_name: "Lovelace" },
    });

    expect(sessionStorage.getItem("intake_phone")).toBe("+14075551234");
    expect(sessionStorage.getItem("intake_email")).toBe("ada@example.test");
    expect(sessionStorage.getItem("intake_firstName")).toBe("Ada");
    expect(sessionStorage.getItem("intake_lastName")).toBe("Lovelace");
  });

  it("does not overwrite existing intake identity values", () => {
    sessionStorage.setItem("intake_firstName", "Existing");
    seedIntakeIdentityFromAuth(sessionStorage, {
      phone: "+14075551234",
      userMetadata: { first_name: "Ada" },
    });

    expect(sessionStorage.getItem("intake_firstName")).toBe("Existing");
  });

  it("accepts OIDC-style given/family name metadata keys", () => {
    seedIntakeIdentityFromAuth(sessionStorage, {
      phone: "+14075551234",
      userMetadata: { given_name: "Ada", family_name: "Lovelace" },
    });

    expect(sessionStorage.getItem("intake_firstName")).toBe("Ada");
    expect(sessionStorage.getItem("intake_lastName")).toBe("Lovelace");
  });
});

// Thomas, on Beta (2026-10-12): an account deleted in the Supabase dashboard,
// then the same number registered again in the same tab, showed the deleted
// patient's case. The backend kept them apart; the tab did not — it still held
// the case id, the submitted marker and the name, and the name screen offered
// that name to the new patient, who was filed under it.
describe("intake state belongs to one account", () => {
  const intakeKeys = () => Object.keys(sessionStorage).filter((key) => key.startsWith("intake_"));
  const deletedPatientTab = () => {
    sessionStorage.setItem(INTAKE_OWNER_KEY, "user-old");
    sessionStorage.setItem("intake_submissionId", "sub-old");
    sessionStorage.setItem(INTAKE_SUBMITTED_KEY, "1");
    sessionStorage.setItem("intake_firstName", "Marisol");
    sessionStorage.setItem("intake_lastName", "Quenneville");
  };

  beforeEach(() => sessionStorage.clear());

  describe("at the entry screens", () => {
    it("clears everything the deleted account left when nobody is signed in", () => {
      deletedPatientTab();

      expect(releaseIntakeFromOtherUser(sessionStorage, null)).toBe(true);
      expect(intakeKeys()).toEqual([]);
    });

    it("clears another account's state when a different user is signed in", () => {
      deletedPatientTab();

      expect(releaseIntakeFromOtherUser(sessionStorage, "user-new")).toBe(true);
      expect(intakeKeys()).toEqual([]);
    });

    it("leaves the signed-in owner's own state alone", () => {
      deletedPatientTab();

      expect(releaseIntakeFromOtherUser(sessionStorage, "user-old")).toBe(false);
      expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-old");
      expect(sessionStorage.getItem("intake_firstName")).toBe("Marisol");
    });

    it("clears an unowned case id and marker (written before owners) when nobody is signed in", () => {
      sessionStorage.setItem("intake_submissionId", "sub-old");
      sessionStorage.setItem(INTAKE_SUBMITTED_KEY, "1");
      sessionStorage.setItem("intake_firstName", "Marisol");

      expect(releaseIntakeFromOtherUser(sessionStorage, null)).toBe(true);
      expect(intakeKeys()).toEqual([]);
    });

    it("stamps an unowned case as the signed-in user's rather than clearing it", () => {
      sessionStorage.setItem("intake_submissionId", "sub-1");

      expect(releaseIntakeFromOtherUser(sessionStorage, "user-1")).toBe(false);
      expect(sessionStorage.getItem(INTAKE_OWNER_KEY)).toBe("user-1");
      expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-1");
    });

    it("keeps a name typed before any number was verified — nobody owns it yet", () => {
      sessionStorage.setItem("intake_firstName", "Bea");
      sessionStorage.setItem("intake_lastName", "Newcomer");

      expect(releaseIntakeFromOtherUser(sessionStorage, null)).toBe(false);
      expect(sessionStorage.getItem("intake_firstName")).toBe("Bea");
    });

    it("leaves the resume draft for its own account to restore", () => {
      sessionStorage.setItem("patient_intake_resume_draft", JSON.stringify({ intake_phone: "+14075551234" }));
      deletedPatientTab();

      releaseIntakeFromOtherUser(sessionStorage, null);
      expect(sessionStorage.getItem("patient_intake_resume_draft")).not.toBeNull();
    });
  });

  describe("at verification", () => {
    it("intake: drops the previous account's case and marker, keeps the name just typed, stamps the new owner", () => {
      deletedPatientTab();
      sessionStorage.setItem("intake_firstName", "Bea");
      sessionStorage.setItem("intake_lastName", "Newcomer");
      sessionStorage.setItem("intake_phone", "+14075551234");
      sessionStorage.setItem("intake_incidentType", "car");

      claimIntakeForUser(sessionStorage, "user-new", { keepEnteredIdentity: true });

      expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
      expect(sessionStorage.getItem(INTAKE_SUBMITTED_KEY)).toBeNull();
      expect(sessionStorage.getItem("intake_incidentType")).toBeNull();
      expect(sessionStorage.getItem("intake_firstName")).toBe("Bea");
      expect(sessionStorage.getItem("intake_lastName")).toBe("Newcomer");
      expect(sessionStorage.getItem("intake_phone")).toBe("+14075551234");
      expect(sessionStorage.getItem(INTAKE_OWNER_KEY)).toBe("user-new");
    });

    it("login: clears every key the previous account left", () => {
      deletedPatientTab();

      claimIntakeForUser(sessionStorage, "user-new", { keepEnteredIdentity: false });

      expect(intakeKeys()).toEqual([INTAKE_OWNER_KEY]);
      expect(sessionStorage.getItem(INTAKE_OWNER_KEY)).toBe("user-new");
    });

    it("the same account verifying again keeps its own state", () => {
      deletedPatientTab();

      claimIntakeForUser(sessionStorage, "user-old", { keepEnteredIdentity: false });

      expect(sessionStorage.getItem("intake_submissionId")).toBe("sub-old");
      expect(sessionStorage.getItem(INTAKE_SUBMITTED_KEY)).toBe("1");
    });

    it("an unowned case id and marker are dropped — they cannot be shown to be this account's", () => {
      sessionStorage.setItem("intake_submissionId", "sub-old");
      sessionStorage.setItem(INTAKE_SUBMITTED_KEY, "1");

      claimIntakeForUser(sessionStorage, "user-new", { keepEnteredIdentity: true });

      expect(sessionStorage.getItem("intake_submissionId")).toBeNull();
      expect(sessionStorage.getItem(INTAKE_SUBMITTED_KEY)).toBeNull();
    });
  });

  it("the owner survives the post-submit cleanup, beside the keys the post-submit flow needs", () => {
    sessionStorage.setItem(INTAKE_OWNER_KEY, "user-1");
    sessionStorage.setItem("intake_submissionId", "sub-1");
    sessionStorage.setItem("intake_incidentType", "car");

    clearIntakeSessionAfterSubmit(sessionStorage);

    expect(sessionStorage.getItem(INTAKE_OWNER_KEY)).toBe("user-1");
    expect(sessionStorage.getItem("intake_incidentType")).toBeNull();
  });
});

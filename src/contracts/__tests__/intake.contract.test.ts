import { describe, expect, it } from "vitest";

import {
  caseDataSchema,
  caseSummarySchema,
  caseSummaryUpdatePayloadSchema,
  checkEmailResponseSchema,
  completeIntakePayloadSchema,
  intakePayloadSchema,
  intakeResponseSchema,
  lawyerReviewCaseSchema,
  patientDashboardSchema,
  registerResponseSchema,
  registrationStatusPayloadSchema,
  registrationStatusResponseSchema,
  startIntakePayloadSchema,
  submissionsSchema,
  uploadedFileSchema,
} from "../intake";

describe("frontend API contracts", () => {
  // The gate in front of the new-patient flow. The browser is told one thing
  // about the number it sent, so the schema is strict: a name, an email or a
  // case id arriving beside the status has to fail the parse rather than be
  // handed on.
  it("accepts only the status from the registration check", () => {
    expect(registrationStatusPayloadSchema.parse({ phone: "+14075551234" })).toEqual({ phone: "+14075551234" });
    expect(registrationStatusResponseSchema.parse({ status: "new" })).toEqual({ status: "new" });
    expect(registrationStatusResponseSchema.parse({ status: "existing" })).toEqual({ status: "existing" });

    expect(() => registrationStatusResponseSchema.parse({ status: "maybe" })).toThrow();
    expect(() => registrationStatusResponseSchema.parse({})).toThrow();
    expect(() =>
      registrationStatusResponseSchema.parse({ status: "existing", firstName: "Jane", email: "jane@example.com" })
    ).toThrow();
  });

  it("accepts the intake request and response used by the frontend", () => {
    expect(() =>
      intakePayloadSchema.parse({
        submissionId: "submission-123",
        locale: "en",
        claimant: {
          firstName: "John",
          lastName: "Doe",
          mobile: "5550001234",
          consent: true,
        },
        accident: {
          incidentType: "motor-vehicle-accident",
          incidentDate: "2026-08-19",
          incidentLocation: "New York",
        },
        documents: [],
      })
    ).not.toThrow();
    expect(intakeResponseSchema.parse({ submissionId: "submission-123" })).toEqual({
      submissionId: "submission-123",
    });
  });

  // GET /case/:id omits incident_date entirely and returns submitted_at null while the
  // submission is still in_progress — both were once required and made every call throw
  it("accepts the case payload the backend actually returns", () => {
    const parsed = caseDataSchema.parse({
      submissionId: "submission-123",
      status: "in_progress",
      submittedAt: null,
      firstName: "John",
      incidentType: "motor-vehicle-accident",
      incidentLocation: "New York",
      role: null,
    });

    expect(parsed.firstName).toBe("John");
    expect(parsed.submittedAt).toBeNull();
  });

  it("rejects a renamed case firstName field", () => {
    expect(() =>
      caseDataSchema.parse({
        submissionId: "submission-123",
        status: "submitted",
        submittedAt: "2026-08-20T10:00:00Z",
        first_name: "John",
        incidentType: "motor-vehicle-accident",
        incidentDate: "2026-08-19",
        incidentLocation: "New York",
      })
    ).toThrow();
  });

  it("validates portal submissions including nested backend field names", () => {
    const response = [
      {
        id: "submission-123",
        status: "submitted",
        submitted_at: "2026-08-20T10:00:00Z",
        locale: "en",
        claimant: {
          first_name: "John",
          last_name: "Doe",
          mobile: "5550001234",
        },
        accident: {
          incident_type: "motor-vehicle-accident",
          incident_date: "2026-08-19",
          incident_location: "New York",
        },
      },
    ];

    expect(submissionsSchema.parse(response)).toEqual(response);
  });

  it("validates both check-email outcomes", () => {
    expect(checkEmailResponseSchema.parse({ status: "approved" })).toEqual({ status: "approved" });
    expect(checkEmailResponseSchema.parse({ status: "waitlist" })).toEqual({ status: "waitlist" });
  });

  it("validates register success and error responses", () => {
    expect(registerResponseSchema.parse({ status: "approved", userId: "user-123" })).toEqual({
      status: "approved",
      userId: "user-123",
    });
    expect(registerResponseSchema.parse({ error: "account_exists", message: "Account already exists" })).toEqual({
      error: "account_exists",
      message: "Account already exists",
    });
  });

  it("accepts start-intake payload used by OTP flow", () => {
    expect(() =>
      startIntakePayloadSchema.parse({
        locale: "en",
        claimant: {
          firstName: "John",
          lastName: "Doe",
          mobile: "5550001234",
          email: "john@example.com",
        },
        accident: {
          incidentType: "motor-vehicle-accident",
          incidentDate: "2026-08-19",
          incidentLocation: "New York",
        },
      })
    ).not.toThrow();
  });

  // This assertion used to require the opposite: it fed a category in and
  // expected it stripped, which is how the field silently stopped reaching the
  // backend. documents.category is a real column that the evidence screen fills,
  // so the contract has to carry it through.
  it("accepts complete-intake payload and preserves the document category", () => {
    const parsed = completeIntakePayloadSchema.parse({
      submissionId: "submission-123",
      claimant: {
        residence: "Austin, TX",
      },
      accident: {
        incidentType: "motor-vehicle-accident",
        incidentDate: "2026-08-19",
        incidentLocation: "Austin",
        role: "driver",
      },
      treatmentArea: "Austin, TX",
      companions: [
        {
          firstName: "Jane",
          lastName: "Doe",
          relation: "passenger",
          cellNumber: "(555) 000-1111",
          email: "jane@example.com",
        },
      ],
      documents: [
        {
          fileName: "photo.jpg",
          storagePath: "submissions/submission-123/incidentPhotos/photo.jpg",
          mimeType: "image/jpeg",
          fileSize: 1024,
          category: "incidentPhotos",
        },
      ],
    });

    expect(parsed.documents[0]).toEqual({
      fileName: "photo.jpg",
      storagePath: "submissions/submission-123/incidentPhotos/photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 1024,
      category: "incidentPhotos",
    });

    // A document that has not been categorised is still valid — the field is
    // optional, not required.
    expect(
      uploadedFileSchema.parse({
        fileName: "scan.pdf",
        storagePath: "submissions/submission-123/scan.pdf",
        mimeType: "application/pdf",
        fileSize: 2048,
      }).category
    ).toBeUndefined();

    expect(parsed.companions).toEqual([
      {
        firstName: "Jane",
        lastName: "Doe",
        relation: "passenger",
        cellNumber: "(555) 000-1111",
        email: "jane@example.com",
      },
    ]);
  });
});

// POST /portal/review-case. The masked answer is strict: it is what a lawyer
// who has not accepted receives, and a protected block or an extra field
// arriving in it has to fail the parse rather than be rendered.
describe("lawyer review case contract", () => {
  const review = { status: "pending", canDecide: true, responseDeadline: "2026-10-13T12:00:00.000Z" };
  const caseFacts = {
    incidentType: "car",
    role: "driver",
    injuries: "headNeck,back",
    story: "A pickup ran the red light. Call me at •••.",
    language: "en",
    companionRelations: ["passenger"],
    documentCounts: [{ category: "incidentPhotos", count: 2 }],
  };
  const incident = { date: "2025-11-17", location: "Lamar Blvd & W 38th St, Austin, TX" };
  const files = [
    {
      id: "0d9f6a2e-1c3b-4e5d-8f70-9a1b2c3d4e5f",
      category: "incidentPhotos",
      fileName: "scene.jpg",
      mimeType: "image/jpeg",
      fileSize: 1024,
      kind: "image",
      available: true,
    },
    {
      id: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
      category: "insuranceCard",
      fileName: "card.pdf",
      mimeType: "application/pdf",
      fileSize: 2048,
      kind: "pdf",
      available: true,
    },
    {
      id: "6b5c4d3e-2f1a-4b0c-9d8e-7f6a5b4c3d2e",
      category: "incidentPhotos",
      fileName: "IMG_1.HEIC",
      mimeType: "image/heic",
      fileSize: 4096,
      kind: "file",
      available: false,
    },
  ];
  // Pending: the case, its date and place and its files — without their names.
  const masked = {
    ok: true,
    access: "masked",
    review,
    caseFacts,
    patient: null,
    incident,
    companions: null,
    documents: files.map((file) => ({ ...file, fileName: null })),
  };
  // Rejected or expired: the files are withdrawn.
  const closed = {
    ...masked,
    review: { status: "rejected", canDecide: false, responseDeadline: null },
    documents: null,
  };
  const full = {
    ok: true,
    access: "full",
    review: { ...review, status: "accepted", canDecide: false },
    caseFacts,
    patient: {
      firstName: "Marisol",
      lastName: "Quintanilla",
      mobile: "+15125550147",
      email: "marisol.q@example.com",
      residence: "Austin, TX",
      treatmentArea: "Round Rock, TX",
    },
    incident,
    companions: [{ firstName: "Teo", lastName: null, relation: "passenger", cellNumber: "+15125550198", email: null }],
    documents: files,
  };
  const withMaskedFile = (file: Record<string, unknown>) => ({
    ...masked,
    documents: [{ ...masked.documents[0], ...file }],
  });

  it("accepts the pending, the closed and the full answer the backend returns", () => {
    expect(lawyerReviewCaseSchema.parse(masked)).toEqual(masked);
    expect(lawyerReviewCaseSchema.parse(closed)).toEqual(closed);
    expect(lawyerReviewCaseSchema.parse(full)).toEqual(full);
  });

  it("accepts every state the review can be in, with or without a deadline", () => {
    for (const status of ["pending", "accepted", "rejected", "expired"]) {
      expect(() =>
        lawyerReviewCaseSchema.parse({ ...masked, review: { status, canDecide: false, responseDeadline: null } })
      ).not.toThrow();
    }
    expect(() => lawyerReviewCaseSchema.parse({ ...masked, review: { ...review, status: "revoked" } })).toThrow();
  });

  it("refuses a masked answer carrying the patient or the people who were with them", () => {
    expect(() => lawyerReviewCaseSchema.parse({ ...masked, patient: full.patient })).toThrow();
    expect(() => lawyerReviewCaseSchema.parse({ ...masked, companions: full.companions })).toThrow();
  });

  it("refuses a masked answer whose file carries its own name, a URL or a path", () => {
    expect(() => lawyerReviewCaseSchema.parse({ ...masked, documents: full.documents })).toThrow();
    expect(() => lawyerReviewCaseSchema.parse(withMaskedFile({ fileName: "Marisol_license.jpg" }))).toThrow();
    expect(() =>
      lawyerReviewCaseSchema.parse(withMaskedFile({ url: "https://project.supabase.co/storage/v1/object/sign/x" }))
    ).toThrow();
    expect(() => lawyerReviewCaseSchema.parse(withMaskedFile({ storagePath: "sub/driversLicense/x.jpg" }))).toThrow();
    expect(() => lawyerReviewCaseSchema.parse(withMaskedFile({ imageUrl: "https://x.example/old-field" }))).toThrow();
  });

  it("refuses a full answer whose file carries a URL or a path: files are only ever opened by id", () => {
    const withFullFile = (file: Record<string, unknown>) => ({
      ...full,
      documents: [{ ...full.documents[0], ...file }],
    });
    expect(() =>
      lawyerReviewCaseSchema.parse(withFullFile({ url: "https://project.supabase.co/storage/v1/object/sign/x" }))
    ).toThrow();
    expect(() => lawyerReviewCaseSchema.parse(withFullFile({ storagePath: "sub/driversLicense/x.jpg" }))).toThrow();
  });

  it("refuses a masked answer with a field nobody agreed to send", () => {
    expect(() => lawyerReviewCaseSchema.parse({ ...masked, phone: "+15125550147" })).toThrow();
    expect(() =>
      lawyerReviewCaseSchema.parse({ ...masked, caseFacts: { ...caseFacts, patientName: "Marisol" } })
    ).toThrow();
    expect(() => lawyerReviewCaseSchema.parse({ ...masked, review: { ...review, patientName: "Marisol" } })).toThrow();
    expect(() => lawyerReviewCaseSchema.parse({ ...masked, incident: { ...incident, lat: 30.3072 } })).toThrow();
  });

  it("accepts only the three document kinds, and only UUID ids that can go into a link", () => {
    for (const kind of ["image", "pdf", "file"]) {
      expect(() => lawyerReviewCaseSchema.parse(withMaskedFile({ kind }))).not.toThrow();
    }
    expect(() => lawyerReviewCaseSchema.parse(withMaskedFile({ kind: "html" }))).toThrow();
    expect(() => lawyerReviewCaseSchema.parse(withMaskedFile({ kind: undefined }))).toThrow();
    expect(() => lawyerReviewCaseSchema.parse(withMaskedFile({ available: undefined }))).toThrow();
    for (const id of ["javascript:alert(1)", "../../portal/submissions", "document-0", ""]) {
      expect(() => lawyerReviewCaseSchema.parse(withMaskedFile({ id }))).toThrow();
      expect(() => lawyerReviewCaseSchema.parse({ ...full, documents: [{ ...full.documents[0], id }] })).toThrow();
    }
  });

  it("refuses an answer that is neither masked nor full", () => {
    expect(() => lawyerReviewCaseSchema.parse({ ...masked, access: "partial" })).toThrow();
    expect(() => lawyerReviewCaseSchema.parse({ ...full, patient: null })).toThrow();
    expect(() => lawyerReviewCaseSchema.parse({ ...full, incident: null })).toThrow();
  });
});

// The patient dashboard's provider state: whether a lawyer and a doctor are
// matched, and nothing else. A provider's name or contact details arriving
// beside it — or another case's data — has to fail the parse, and a backend
// that predates the block still parses (the app reads its absence as unmatched).
describe("patient dashboard provider contract", () => {
  const dashboardWith = (extra: Record<string, unknown>) => ({
    patient: null,
    cases: [
      {
        submissionId: "s-1",
        status: "qualified",
        locale: "en",
        incidentType: "car",
        incidentLocation: "Tampa, FL",
        ...extra,
      },
    ],
  });

  it("accepts each provider's matched flag, in every combination", () => {
    for (const lawyer of [true, false]) {
      for (const doctor of [true, false]) {
        const parsed = patientDashboardSchema.parse(
          dashboardWith({ providers: { lawyer: { matched: lawyer }, doctor: { matched: doctor } } })
        );
        expect(parsed.cases[0].providers).toEqual({ lawyer: { matched: lawyer }, doctor: { matched: doctor } });
      }
    }
  });

  it("accepts a case without the block", () => {
    expect(patientDashboardSchema.parse(dashboardWith({})).cases[0].providers).toBeUndefined();
  });

  it("refuses anything more than the matched flags", () => {
    const extras = [
      { lawyer: { matched: true, name: "Another Firm" }, doctor: { matched: false } },
      { lawyer: { matched: true }, doctor: { matched: false, phone: "+15555550100" } },
      { lawyer: { matched: true }, doctor: { matched: false }, otherCase: { lawyer: { matched: true } } },
      { lawyer: { matched: "yes" }, doctor: { matched: false } },
      { lawyer: { matched: true } },
    ];
    for (const providers of extras) {
      expect(() => patientDashboardSchema.parse(dashboardWith({ providers }))).toThrow();
    }
  });

  // GET /case/:submissionId as the backend sends it (haa-backend src/types/case.ts).
  it("accepts the case summary the backend returns", () => {
    const summary = {
      submissionId: "submission-123",
      status: "submitted",
      submittedAt: "2026-08-20T10:00:00Z",
      firstName: "John",
      lastName: "Doe",
      phone: "+15551234567",
      email: null,
      incidentType: "car",
      incidentDate: "2026-08-19",
      incidentLocation: "Orlando, FL, USA",
      incidentLocationDetails: {
        text: "Orlando, FL, USA",
        latitude: 28.5,
        longitude: -81.4,
        placeId: "place",
        city: "Orlando",
        state: "FL",
        source: "autosuggest",
        precision: "city_estimate",
      },
      role: null,
      injuries: null,
      treatmentArea: null,
      treatmentAreaLocationDetails: null,
      companions: [{ firstName: "Ana", lastName: "", relation: "friend" }],
      documents: [{ id: "d1", fileName: "a.pdf", mimeType: "application/pdf", category: null }],
      editable: false,
    };
    expect(caseSummarySchema.parse(summary)).toEqual(summary);
    expect(() => caseSummarySchema.parse({ ...summary, editable: undefined })).toThrow();
  });

  // POST /case/:submissionId: strict at every level, with no email or phone anywhere.
  it("builds a case summary save only from what Case Summary may change", () => {
    const valid = {
      claimant: { firstName: "John", lastName: "Doe" },
      accident: {
        incidentType: "car",
        incidentDate: "2026-08-19",
        incidentLocation: "Orlando, FL, USA",
        incidentLocationDetails: null,
        role: "driver",
      },
      injuries: "back",
      treatmentArea: "Orlando, FL 32801",
      treatmentAreaLocationDetails: null,
    };
    expect(caseSummaryUpdatePayloadSchema.parse(valid)).toEqual(valid);
    for (const field of ["email", "phone", "mobile", "status"]) {
      expect(() => caseSummaryUpdatePayloadSchema.parse({ ...valid, [field]: "x" }), field).toThrow();
      expect(
        () => caseSummaryUpdatePayloadSchema.parse({ claimant: { ...valid.claimant, [field]: "x" } }),
        `claimant.${field}`
      ).toThrow();
      expect(
        () => caseSummaryUpdatePayloadSchema.parse({ accident: { ...valid.accident, [field]: "x" } }),
        `accident.${field}`
      ).toThrow();
    }
  });
});

import { z } from "zod";
import { UUID_PATTERN } from "@/lib/constants";

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
  })
  .strict();

export const uploadedFileSchema = z.object({
  fileName: z.string(),
  storagePath: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  // Persisted by the backend as documents.category. Optional because the same
  // schema describes documents that have not been categorised yet. Without the
  // field declared, Zod strips it on parse and the category the patient chose
  // reaches the backend as undefined, so documents.category is stored null.
  category: z.string().optional(),
});

export const documentUploadUrlPayloadSchema = z.object({
  submissionId: z.string().min(1),
  fileName: z.string().min(1),
  category: z.string().optional(),
});

export const deleteDocumentPayloadSchema = z.object({
  submissionId: z.string().min(1),
  storagePath: z.string().min(1),
});

export const documentUploadUrlResponseSchema = z.object({
  bucket: z.string(),
  storagePath: z.string(),
  token: z.string(),
});

export type DocumentUploadUrl = z.infer<typeof documentUploadUrlResponseSchema>;

export const intakeCompanionSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  relation: z.string(),
  cellNumber: z.string(),
  email: z.string().optional(),
});

export const locationDetailsSchema = z.object({
  text: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  placeId: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  source: z.enum(["autosuggest", "current_location", "manual"]),
  precision: z.enum(["address", "city_estimate", "unvalidated"]),
});

export const intakePayloadSchema = z.object({
  submissionId: z.string(),
  locale: z.string(),
  claimant: z.object({
    firstName: z.string(),
    lastName: z.string(),
    mobile: z.string(),
    email: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    consent: z.literal(true),
    contactMethod: z.string().optional(),
    treatmentArea: z.string().optional(),
  }),
  accident: z.object({
    incidentType: z.string(),
    incidentDate: z.string(),
    incidentLocation: z.string(),
    incidentLocationDetails: locationDetailsSchema.nullable().optional(),
    description: z.string().optional(),
    injuries: z.string().optional(),
    insuranceStatus: z.string().optional(),
    insuranceDetails: z.string().optional(),
    role: z.string().optional(),
  }),
  documents: z.array(uploadedFileSchema),
});

export const startIntakePayloadSchema = z.object({
  locale: z.string(),
  claimant: z.object({
    firstName: z.string(),
    lastName: z.string(),
    mobile: z.string(),
    email: z.string().optional(),
  }),
  // Absent on the call that opens the case at verification, present on the one
  // that follows once the accident screens have been answered.
  accident: z
    .object({
      incidentType: z.string(),
      incidentDate: z.string(),
      incidentLocation: z.string(),
      incidentLocationDetails: locationDetailsSchema.nullable().optional(),
      description: z.string().optional(),
      injuries: z.string().optional(),
      insuranceStatus: z.string().optional(),
      insuranceDetails: z.string().optional(),
      role: z.string().optional(),
    })
    .optional(),
});

export const completeIntakePayloadSchema = z.object({
  submissionId: z.string(),
  claimant: z.object({
    residence: z.string().optional(),
    residenceLocationDetails: locationDetailsSchema.nullable().optional(),
  }),
  accident: z.object({
    incidentType: z.string(),
    incidentDate: z.string(),
    incidentLocation: z.string(),
    incidentLocationDetails: locationDetailsSchema.nullable().optional(),
    role: z.string().optional(),
    description: z.string().optional(),
    injuries: z.string().optional(),
    injuryTypes: z.string().optional(),
  }),
  treatmentArea: z.string().optional(),
  treatmentAreaLocationDetails: locationDetailsSchema.nullable().optional(),
  companions: z.array(intakeCompanionSchema).optional(),
  documents: z.array(uploadedFileSchema),
});

export const submissionSummarySchema = z.object({
  id: z.string(),
  status: z.string(),
  submitted_at: z.string(),
  locale: z.string(),
  claimant: z
    .object({
      first_name: z.string(),
      last_name: z.string(),
      mobile: z.string(),
      email: z.string().optional(),
      city: z.string().optional(),
      contact_method: z.string().optional(),
    })
    .nullable(),
  accident: z
    .object({
      incident_type: z.string(),
      incident_date: z.string(),
      incident_location: z.string(),
      description: z.string().optional(),
      injuries: z.string().optional(),
      role: z.string().optional(),
    })
    .nullable(),
});

export const submissionsSchema = z.array(submissionSummarySchema);

export const intakeResponseSchema = z.object({
  submissionId: z.string(),
});

export const caseDataSchema = z.object({
  submissionId: z.string(),
  status: z.string(),
  // null until /intake/complete marks the submission submitted
  submittedAt: z.string().nullish(),
  firstName: z.string(),
  incidentType: z.string(),
  // not returned by GET /case/:id — the accidents select omits incident_date
  incidentDate: z.string().nullish(),
  // Backend always sends incidentLocation (required DB field)
  incidentLocation: z.string(),
  // Backend sends null when not set — .nullish() accepts both null and absent
  role: z.string().nullish(),
  contactMethod: z.string().nullish(),
});

// GET /case/:submissionId and the answer to POST /case/:submissionId — the
// patient's own case as Case Summary shows it. Additive over caseDataSchema:
// the same route, with what the screen needs to show and correct the case.
export const caseSummarySchema = z.object({
  submissionId: z.string(),
  status: z.string(),
  submittedAt: z.string().nullish(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  email: z.string().nullish(),
  incidentType: z.string(),
  incidentDate: z.string().nullish(),
  incidentLocation: z.string(),
  incidentLocationDetails: locationDetailsSchema.nullish(),
  role: z.string().nullish(),
  // comma-joined injury keys, plus any the patient typed, as /intake/complete stored them
  injuries: z.string().nullish(),
  treatmentArea: z.string().nullish(),
  treatmentAreaLocationDetails: locationDetailsSchema.nullish(),
  // id, cellNumber and email come from a backend that lets Case Summary edit
  // companions; one that predates it sends name and relation only, and the
  // screen then shows the list without an edit control.
  companions: z.array(
    z.object({
      id: z.string().optional(),
      firstName: z.string(),
      lastName: z.string(),
      relation: z.string(),
      cellNumber: z.string().optional(),
      email: z.string().nullish(),
    })
  ),
  documents: z.array(
    z.object({ id: z.string(), fileName: z.string(), mimeType: z.string(), category: z.string().nullish() })
  ),
  // Decided by the backend (canEditCaseSummary there): true for every submitted
  // case. The backend refuses a save otherwise.
  editable: z.boolean(),
});

// POST /case/:submissionId. Strict at every level and with no email or phone
// anywhere: the screen cannot build a body that changes either, and the
// backend refuses one that names them (400 field_not_editable) regardless.
export const caseSummaryUpdatePayloadSchema = z
  .object({
    claimant: z.object({ firstName: z.string(), lastName: z.string() }).strict().optional(),
    accident: z
      .object({
        incidentType: z.string(),
        incidentDate: z.string(),
        incidentLocation: z.string(),
        incidentLocationDetails: locationDetailsSchema.strict().nullable().optional(),
        role: z.string(),
      })
      .strict()
      .optional(),
    injuries: z.string().optional(),
    treatmentArea: z.string().optional(),
    treatmentAreaLocationDetails: locationDetailsSchema.strict().nullable().optional(),
    // The whole list as it should now be: an id keeps and updates that
    // companion, no id adds one, and a stored companion left out is removed.
    companions: z
      .array(
        z
          .object({
            id: z.string().optional(),
            firstName: z.string(),
            lastName: z.string(),
            relation: z.string(),
            cellNumber: z.string(),
            email: z.string().nullable(),
          })
          .strict()
      )
      .optional(),
    // Files already uploaded through /intake/documents/upload-url, recorded on
    // the case by Save, and the case's own document ids to remove.
    documents: z
      .object({
        add: z.array(
          z
            .object({
              storagePath: z.string(),
              fileName: z.string(),
              mimeType: z.string(),
              fileSize: z.number(),
              category: z.string(),
            })
            .strict()
        ),
        remove: z.array(z.string()),
      })
      .strict()
      .optional(),
  })
  .strict();

export const patientDashboardCaseSchema = z.object({
  submissionId: z.string(),
  status: z.string(),
  submittedAt: z.string().nullish(),
  locale: z.string(),
  treatmentArea: z.string().nullish(),
  incidentType: z.string(),
  incidentLocation: z.string(),
  role: z.string().nullish(),
  incidentDate: z.string().nullish(),
  // The case's active agreement as the backend stores it (created, sent,
  // delivered, completed), null when there is none.
  agreementStatus: z.string().nullish(),
  // Accepted by the Admin Dashboard and not signed yet: the patient's next step
  // is the retainer. Decided by the backend (lib/case-status.ts there), never
  // here; absent from a backend that predates it, which offers no signing.
  awaitingSignature: z.boolean().optional(),
  // Whether a lawyer and a doctor are matched with the case, each on its own.
  // Decided by the backend (lib/provider-matches.ts there) and read here only
  // through lib/provider-matches.ts; absent from a backend that predates it,
  // which this app reads as neither matched.
  providers: z
    .object({
      lawyer: z.object({ matched: z.boolean() }).strict(),
      doctor: z.object({ matched: z.boolean() }).strict(),
    })
    .strict()
    .optional(),
});

export const patientDashboardSchema = z
  .object({
    patient: z
      .object({
        firstName: z.string(),
        lastName: z.string(),
        mobile: z.string(),
        email: z.string().nullish(),
      })
      .nullish(),
    cases: z.array(patientDashboardCaseSchema),
  })
  .strict();

export const patientIntakeResumeSchema = z
  .object({
    patient: z
      .object({
        firstName: z.string(),
        lastName: z.string(),
        mobile: z.string(),
        email: z.string().nullish(),
      })
      .nullish(),
    submissionId: z.string().nullish(),
  })
  .strict();

export const checkEmailResponseSchema = z.object({
  status: z.enum(["waitlist", "approved"]),
});

export const checkEmailPayloadSchema = z.object({
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  mobile: z.string(),
  practice: z.string().optional(),
  role: z.string(),
});

export const registerPayloadSchema = z.object({
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  password: z.string(),
});

// Backend returns two distinct shapes:
//   success (201): { status: "approved", userId: string }
//   account_exists (409): { error: "account_exists", message: string }
//   other errors (400/500): { error: string }
// The page branches on data.status and data.error — both paths must parse.
export const registerResponseSchema = z.union([
  z.object({ status: z.literal("approved"), userId: z.string() }),
  apiErrorSchema,
]);

// ── Development authentication bridge ────────────────────────────────────────
// The backend verifies the development OTP and returns a Supabase session. The
// response is strict: only what the browser client needs to establish a session,
// and nothing that identifies the patient. Identity is read from the session
// itself, never from this payload.

export const verifyOtpPayloadSchema = z.object({
  phone: z.string().min(1),
  code: z.string().min(1),
});

export const verifyOtpResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresIn: z.number(),
  })
  .strict();

// ── Duplicate registration ───────────────────────────────────────────────────
// The gate in front of the new-patient flow. The response is strict and holds
// one enum value: if a name, an email, a case or an identifier ever appears
// beside it, the parse fails rather than quietly handing the browser something
// an unauthenticated caller has no right to.

export const registrationStatusPayloadSchema = z.object({
  phone: z.string().min(1),
});

export const registrationStatusResponseSchema = z
  .object({
    // "existing" means this number can already sign in; "new" means the
    // new-patient flow is the right place for it.
    status: z.enum(["new", "existing"]),
  })
  .strict();

export type RegistrationStatus = z.infer<typeof registrationStatusResponseSchema>["status"];

// ── DocuSign agreement ───────────────────────────────────────────────────────
// The envelope id and template id are deliberately absent. Both schemas are
// strict, so if either ever appears in a backend response the parse fails
// instead of quietly handing an internal identifier to the browser.

export const agreementStatusSchema = z.enum(["created", "sent", "delivered", "completed", "declined", "voided"]);

export const agreementPayloadSchema = z.object({
  submissionId: z.string().min(1),
  // The patient's current language selection, and the source of truth for which
  // retainer template the backend uses. Constrained to the supported languages
  // so an unknown value never reaches the backend.
  locale: z.enum(["en", "es"]),
});

// DocuSign's embedding library for the environment and the integration's
// public client id it is loaded with; sent alongside a signing URL so the
// ceremony can be mounted inside the application rather than navigated to.
export const signingEmbedSchema = z
  .object({
    scriptUrl: z.string().url(),
    integrationKey: z.string().min(1),
  })
  .strict();

export const createAgreementResponseSchema = z
  .object({
    status: agreementStatusSchema,
    // Absent once the agreement is complete — there is nothing left to sign.
    signingUrl: z.string().url().optional(),
    embed: signingEmbedSchema.optional(),
  })
  .strict();

export const agreementStatusResponseSchema = z
  .object({
    status: agreementStatusSchema,
  })
  .strict();

// POST /portal/review-case: what a lawyer's review link may see. The backend
// decides: the case, the accident's date and place and the files, for judging
// it, and nothing that identifies the patient until the lawyer has accepted.
// The masked shape is strict, so a patient or companion block, a file's own
// name or a URL arriving before acceptance fails the parse and the page shows
// an error rather than rendering it.
const lawyerReviewSchema = z
  .object({
    status: z.enum(["pending", "accepted", "rejected", "expired"]),
    canDecide: z.boolean(),
    responseDeadline: z.string().nullable(),
  })
  .strict();

const lawyerReviewCaseFactsSchema = z
  .object({
    incidentType: z.string().nullable(),
    role: z.string().nullable(),
    injuries: z.string().nullable(),
    story: z.string().nullable(),
    language: z.string().nullable(),
    companionRelations: z.array(z.string()),
    documentCounts: z.array(z.object({ category: z.string(), count: z.number().int().nonnegative() }).strict()),
  })
  .strict();

const lawyerReviewIncidentSchema = z
  .object({
    date: z.string().nullable(),
    location: z.string().nullable(),
  })
  .strict();

// A file of the case. There is no URL: the page opens it through its own
// /api/review/documents/<id> route, so the id is the only part that reaches an
// href, and it has to be a UUID.
const lawyerReviewDocumentSchema = z
  .object({
    id: z.string().regex(UUID_PATTERN),
    category: z.string(),
    fileName: z.string().nullable(),
    mimeType: z.string().nullable(),
    fileSize: z.number().nullable(),
    // How the file may be opened, decided by the backend from the type
    // Storage serves: image and pdf inline, file only as a download.
    kind: z.enum(["image", "pdf", "file"]),
    // Whether Storage holds it inside this case's folder, so it can be opened.
    available: z.boolean(),
  })
  .strict();

// The patient's signed retainer: whether it is signed and whether this link may
// open it — nothing that locates it. The page opens it through its own
// /api/review/retainer route. Optional so a backend that predates it still
// loads the page, which then shows no retainer section.
const lawyerReviewSignedRetainerSchema = z.object({ signed: z.boolean(), available: z.boolean() }).strict();

export const maskedLawyerReviewCaseSchema = z
  .object({
    ok: z.literal(true),
    access: z.literal("masked"),
    review: lawyerReviewSchema,
    caseFacts: lawyerReviewCaseFactsSchema,
    patient: z.null(),
    incident: lawyerReviewIncidentSchema,
    companions: z.null(),
    // Listed while the link may open files, null once it may not. Before
    // acceptance a file's own name is withheld: patients often make it theirs.
    documents: z.array(lawyerReviewDocumentSchema.extend({ fileName: z.null() }).strict()).nullable(),
    // Before acceptance the retainer can never be opened, whatever is sent.
    signedRetainer: lawyerReviewSignedRetainerSchema
      .extend({ available: z.literal(false) })
      .strict()
      .optional(),
  })
  .strict();

export const fullLawyerReviewCaseSchema = z.object({
  ok: z.literal(true),
  access: z.literal("full"),
  review: lawyerReviewSchema,
  caseFacts: lawyerReviewCaseFactsSchema,
  patient: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    mobile: z.string().nullable(),
    email: z.string().nullable(),
    residence: z.string().nullable(),
    treatmentArea: z.string().nullable(),
  }),
  incident: lawyerReviewIncidentSchema,
  companions: z.array(
    z.object({
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      relation: z.string().nullable(),
      cellNumber: z.string().nullable(),
      email: z.string().nullable(),
    })
  ),
  documents: z.array(lawyerReviewDocumentSchema),
  signedRetainer: lawyerReviewSignedRetainerSchema.optional(),
});

export const lawyerReviewCaseSchema = z.discriminatedUnion("access", [
  maskedLawyerReviewCaseSchema,
  fullLawyerReviewCaseSchema,
]);

export type AgreementStatus = z.infer<typeof agreementStatusSchema>;

export type IntakeResponse = z.infer<typeof intakeResponseSchema>;
export type SubmissionSummary = z.infer<typeof submissionSummarySchema>;
export type CaseData = z.infer<typeof caseDataSchema>;
export type CaseSummary = z.infer<typeof caseSummarySchema>;
export type CaseSummaryUpdatePayload = z.infer<typeof caseSummaryUpdatePayloadSchema>;
export type PatientDashboard = z.infer<typeof patientDashboardSchema>;
export type PatientIntakeResume = z.infer<typeof patientIntakeResumeSchema>;
export type CheckEmailResponse = z.infer<typeof checkEmailResponseSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
export type LawyerReviewCase = z.infer<typeof lawyerReviewCaseSchema>;

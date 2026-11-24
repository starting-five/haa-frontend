import type { z } from "zod";

import type { uploadedFileSchema } from "@/contracts/intake";

// values also used by the "Case" and "Intake.accident" translation namespaces
export const INCIDENT_TYPE_VALUES = [
  "car",
  "motorcycle",
  "truck",
  "rideshare",
  "slip-and-fall",
  "pedestrian",
  "bicycle",
  "other",
] as const;

// values also used by the "Case" translation namespace; the renders are the
// design's (Figma 1949:3653), stored at twice their 127px display height
export const ROLE_VALUES = [
  { value: "driver", image: "/assets/role/driver.webp", width: 142, height: 254 },
  { value: "passenger", image: "/assets/role/passanger.webp", width: 140, height: 254 },
  { value: "pedestrian", image: "/assets/role/pedestrian.webp", width: 160, height: 254 },
  { value: "bicyclist", image: "/assets/role/bicyclist.webp", width: 217, height: 254 },
] as const;

// The evidence categories a document can be filed under. The values are the
// translation keys of the "IntakeEvidence.category" namespace and the folder
// segment of the object key the backend mints, so the copy, the storage layout
// and documents.category all stay in step.
export const EVIDENCE_CATEGORY_VALUES = [
  "accidentReport",
  "incidentPhotos",
  "insuranceCard",
  "driversLicense",
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORY_VALUES)[number];

export function isEvidenceCategory(value: unknown): value is EvidenceCategory {
  return typeof value === "string" && (EVIDENCE_CATEGORY_VALUES as readonly string[]).includes(value);
}

// Derived from the wire contract rather than declared separately. The two were
// written independently and drifted: this interface allowed a category the
// schema did not declare, so Zod dropped the field on parse and the type system
// reported nothing. Deriving the type means a field can no longer exist here
// without also existing on the request.
export type UploadedFile = z.infer<typeof uploadedFileSchema>;

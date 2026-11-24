// The patient's care team — the matched attorney and the matched doctor.
//
// Whether either is matched comes from the backend (each dashboard case's
// providers block, read through lib/provider-matches.ts). Who they are does not:
// a lawyer accepts a case through a review link that records no firm, and no
// doctor is recorded at all. Until provider identity is persisted these records
// are the single source for the screens that name a provider, replacing the
// three literals that were duplicated across choose-attorney, hire-attorney and
// the dashboard — and they are shown only for a provider the backend reports matched.
//
// The values are the ones Figma shows (4181:5101, 4182:5033, 4200:12992,
// 4188:12958). They are placeholders, not a real firm's contact details.
//
// TODO: load these from the submission once provider matching is stored, and
// delete the PLACEHOLDER_* records.

export interface ProviderContact {
  address: string;
  email: string;
  // Display form, without the scheme — the popup renders it as written.
  website: string;
  phone: string;
}

export interface Provider {
  // The heading's second line: the firm or practice name.
  name: string;
  contact: ProviderContact;
}

export const PLACEHOLDER_ATTORNEY: Provider = {
  name: "Louis Berk Injury & Trial Attorneys",
  contact: {
    address: "326 N. Magnolia Avenue\nFloor 2\nOrlando FL 32801",
    email: "intakes@louisberklaw.com",
    website: "louisberklaw.com",
    phone: "(407) 906-0500",
  },
};

export const PLACEHOLDER_DOCTOR: Provider = {
  name: "Bay Area Injury & Rehabilitation",
  contact: {
    address: "125 Market St, San Jose, CA",
    email: "care@yourdoctor.com",
    website: "Yourdoctor.com",
    phone: "(408) 555-0199",
  },
};

// The attorney's short name, as the dashboard's team card shows it.
export const ATTORNEY_SHORT_NAME = "Louis Berk";

export function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function toWebsiteHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export const COMPANION_RELATIONS = ["passenger", "driver", "other"] as const;
export type CompanionRelation = (typeof COMPANION_RELATIONS)[number];

/**
 * The relations a companion can be given on "Who was with you?". A patient who
 * was the driver (intake_role, chosen on the role screen) cannot add another
 * driver, so "driver" leaves the list itself rather than being hidden — the
 * stored answer, the edit form and the review pill all read from this one list.
 */
export function companionRelationsFor(patientRole: string | null | undefined): readonly CompanionRelation[] {
  return patientRole === "driver"
    ? COMPANION_RELATIONS.filter((relation) => relation !== "driver")
    : COMPANION_RELATIONS;
}

// The IntakeWhoWasWithYou message naming each relation. The edit form, its list
// and the case summary all label a companion from here.
const COMPANION_RELATION_LABEL_KEYS: Record<CompanionRelation, string> = {
  passenger: "relationPassenger",
  driver: "relationDriver",
  other: "relationOther",
};

/** The message key for a stored relation, or undefined for one this app never offers. */
export function companionRelationLabelKey(relation: string): string | undefined {
  return (COMPANION_RELATIONS as readonly string[]).includes(relation)
    ? COMPANION_RELATION_LABEL_KEYS[relation as CompanionRelation]
    : undefined;
}

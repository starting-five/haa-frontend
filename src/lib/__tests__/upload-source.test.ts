import { describe, expect, it } from "vitest";

import {
  activeCategory,
  CATEGORY_ACCEPT,
  DOCUMENT_ACCEPT,
  IMAGE_ACCEPT,
  initialUploadSourceState,
  pickerAttributesFor,
  sourcesForCategory,
  uploadSourceReducer,
  UPLOAD_SOURCE_VALUES,
  type UploadSourceEvent,
  type UploadSourceState,
} from "@/lib/upload-source";
import { EVIDENCE_CATEGORY_VALUES, type EvidenceCategory } from "@/types/intake";

// The bug this machine exists to kill: after the patient chose a source, the
// app's own sheet came back on top of — or instead of — the native picker, so
// the same three options appeared twice for one tap. Every test below is a
// different way of asking "can anything other than tapping a category put the
// sheet back on screen?", and the answer has to be no.

const run = (events: UploadSourceEvent[], from: UploadSourceState = initialUploadSourceState) =>
  events.reduce(uploadSourceReducer, from);

const opened = (category: EvidenceCategory = "incidentPhotos") => run([{ type: "category-opened", category }]);

const picking = (category: EvidenceCategory = "incidentPhotos") =>
  run([{ type: "source-chosen", source: "photos" }], opened(category));

describe("upload source machine", () => {
  it("starts on the category list with nothing selected", () => {
    expect(initialUploadSourceState).toEqual({ status: "idle" });
    expect(activeCategory(initialUploadSourceState)).toBeNull();
  });

  it("opens the sheet only when a category is tapped", () => {
    expect(opened("insuranceCard")).toEqual({ status: "choosing", category: "insuranceCard" });
  });

  it("moves from the sheet to the native picker, keeping the category the files go into", () => {
    const state = picking("driversLicense");
    expect(state).toEqual({ status: "picking", category: "driversLicense", source: "photos" });
    expect(activeCategory(state)).toBe("driversLicense");
  });

  it("never re-opens the sheet once a source has been chosen", () => {
    const after: UploadSourceEvent[] = [
      { type: "source-chosen", source: "camera" },
      { type: "files-selected" },
      { type: "files-selected" },
      { type: "source-chosen", source: "document" },
      { type: "sheet-dismissed" },
    ];

    for (let i = 1; i <= after.length; i += 1) {
      const state = run(after.slice(0, i), picking());
      expect(state.status).not.toBe("choosing");
    }
  });

  it("keeps the category and the source through the picker returning with files", () => {
    const state = run([{ type: "files-selected" }], picking("accidentReport"));
    expect(state).toEqual({ status: "browsing", category: "accidentReport", source: "photos" });
    expect(activeCategory(state)).toBe("accidentReport");
  });

  it("returns to the category list when the picker is closed empty-handed", () => {
    expect(run([{ type: "picker-cancelled" }], picking())).toEqual({ status: "idle" });
  });

  it("ignores a cancellation that arrives after the files did", () => {
    // The cancel signal is a 300ms window-focus check, so it can land after a
    // selection has already moved the screen on. Honouring it there would
    // throw away the files the patient just chose.
    const browsing = run([{ type: "files-selected" }], picking());
    expect(run([{ type: "picker-cancelled" }], browsing)).toEqual(browsing);
  });

  it("closes the sheet without opening a picker when it is dismissed", () => {
    expect(run([{ type: "sheet-dismissed" }], opened())).toEqual({ status: "idle" });
  });

  it("leaves the upload view only on an explicit close", () => {
    expect(run([{ type: "category-closed" }], picking())).toEqual({ status: "idle" });
    expect(run([{ type: "category-closed" }], run([{ type: "files-selected" }], picking()))).toEqual({
      status: "idle",
    });
  });

  it("ignores events that do not apply to the current state", () => {
    const idle = initialUploadSourceState;
    expect(run([{ type: "source-chosen", source: "camera" }], idle)).toBe(idle);
    expect(run([{ type: "files-selected" }], idle)).toBe(idle);
    expect(run([{ type: "picker-cancelled" }], idle)).toBe(idle);
    expect(run([{ type: "sheet-dismissed" }], idle)).toBe(idle);
    // ...and a stray files-selected while the sheet is open does not skip it.
    expect(run([{ type: "files-selected" }], opened())).toEqual(opened());
  });

  it("switches category cleanly when a second one is tapped", () => {
    const state = run([{ type: "category-opened", category: "driversLicense" }], picking("accidentReport"));
    expect(state).toEqual({ status: "choosing", category: "driversLicense" });
  });
});

describe("picker configuration", () => {
  it("asks for the camera only for the camera source", () => {
    for (const category of EVIDENCE_CATEGORY_VALUES) {
      expect(pickerAttributesFor(category, "camera").capture).toBe("environment");
      expect(pickerAttributesFor(category, "photos").capture).toBeUndefined();
      expect(pickerAttributesFor(category, "document").capture).toBeUndefined();
    }
  });

  it("never mixes media with non-media in one accept list", () => {
    // iOS gets this wrong: with a list that spans both, documents become
    // unselectable in the picker it opens. Each source therefore asks for one
    // kind of thing.
    for (const category of EVIDENCE_CATEGORY_VALUES) {
      for (const source of UPLOAD_SOURCE_VALUES) {
        const types = pickerAttributesFor(category, source).accept.split(",");
        const media = types.filter((type) => type.startsWith("image/") || type.startsWith("video/"));
        expect(media.length === 0 || media.length === types.length).toBe(true);
      }
    }
  });

  it("opens the camera and the photo library at images, and the file browser at documents", () => {
    expect(pickerAttributesFor("incidentPhotos", "camera")).toEqual({
      accept: IMAGE_ACCEPT,
      capture: "environment",
    });
    expect(pickerAttributesFor("incidentPhotos", "photos")).toEqual({ accept: IMAGE_ACCEPT });
    expect(pickerAttributesFor("accidentReport", "document")).toEqual({ accept: DOCUMENT_ACCEPT });
  });

  it("only offers a document source where the category accepts documents", () => {
    expect(sourcesForCategory("incidentPhotos")).toEqual(["camera", "photos"]);
    for (const category of EVIDENCE_CATEGORY_VALUES) {
      const sources = sourcesForCategory(category);
      expect(sources.includes("document")).toBe(CATEGORY_ACCEPT[category].includes(DOCUMENT_ACCEPT));
      expect(sources).toContain("camera");
      expect(sources).toContain("photos");
    }
  });

  it("accepts a photo everywhere, and a video nowhere", () => {
    for (const category of EVIDENCE_CATEGORY_VALUES) {
      expect(CATEGORY_ACCEPT[category]).toContain(IMAGE_ACCEPT);
      expect(CATEGORY_ACCEPT[category].some((type) => type.startsWith("video/"))).toBe(false);
    }
  });
});

// Mounts a DocuSign signing session inside the application with DocuSign's
// own embedding library, so the patient signs without leaving the page. The
// library is loaded from DocuSign's CDN for the environment the backend named,
// and initialised with the integration's public client id the backend sends
// alongside the signing URL.

const ALLOWED_LIBRARY_HOSTS = new Set(["js-d.docusign.com", "js.docusign.com"]);

export type SessionEndType =
  | "signing_complete"
  | "cancel"
  | "decline"
  | "exception"
  | "fax_pending"
  | "session_timeout"
  | "ttl_expired"
  | "viewing_complete"
  | (string & {});

export interface SessionEndEvent {
  sessionEndType?: SessionEndType;
  returnUrl?: string;
}

interface DocusignSigningSession {
  on(event: "ready", handler: () => void): void;
  on(event: "sessionEnd", handler: (event: SessionEndEvent) => void): void;
  mount(container: string | HTMLElement): void;
  destroy(): void;
}

interface DocusignLibrary {
  signing(options: {
    url: string;
    displayFormat?: "focused" | "default";
    style?: Record<string, unknown>;
  }): DocusignSigningSession;
}

declare global {
  interface Window {
    DocuSign?: { loadDocuSign(clientId: string): Promise<DocusignLibrary> };
  }
}

export interface EmbeddedSigningOptions {
  scriptUrl: string;
  integrationKey: string;
  signingUrl: string;
  container: HTMLElement;
  onReady: () => void;
  onSessionEnd: (event: SessionEndEvent) => void;
}

export interface EmbeddedSigningHandle {
  destroy: () => void;
}

const loading = new Map<string, Promise<void>>();

/** Loads the library once per page; a second mount reuses the same script. */
function loadLibrary(scriptUrl: string): Promise<void> {
  const url = new URL(scriptUrl);
  if (url.protocol !== "https:" || !ALLOWED_LIBRARY_HOSTS.has(url.host)) {
    return Promise.reject(new Error("signing_library_not_allowed"));
  }
  if (window.DocuSign) return Promise.resolve();

  let pending = loading.get(url.href);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url.href;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading.delete(url.href);
        script.remove();
        reject(new Error("signing_library_failed"));
      };
      document.head.appendChild(script);
    });
    loading.set(url.href, pending);
  }
  return pending;
}

/**
 * The library asks the browser for crypto.randomUUID, which browsers expose
 * only to secure contexts. The application's origins are HTTPS, where the real
 * function exists and this is never reached; the plain-HTTP test host is the
 * one place it is missing. The value is a session identifier, not a credential.
 */
function ensureRandomUuid(): void {
  if (typeof window.crypto?.randomUUID === "function") return;
  window.crypto.randomUUID = () => {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}

/**
 * Starts the signing session in `container`. Resolves once the session is
 * created; `onReady` fires when DocuSign has rendered the document and
 * `onSessionEnd` when the signer finishes, cancels or declines.
 */
export async function startEmbeddedSigning(options: EmbeddedSigningOptions): Promise<EmbeddedSigningHandle> {
  await loadLibrary(options.scriptUrl);
  if (!window.DocuSign) throw new Error("signing_library_failed");

  ensureRandomUuid();
  const library = await window.DocuSign.loadDocuSign(options.integrationKey);
  const session = library.signing({
    url: options.signingUrl,
    // Not "focused": since 2026-10-08 DocuSign's demo focused view frames
    // https://demo.docusign.net:7802/, which its own frame-src refuses, so the
    // patient gets a blocked frame and never sees the retainer. The default
    // view loads the document from apps-d.docusign.com and signs normally.
    displayFormat: "default",
    // The brand colour on DocuSign's own controls; everything else is theirs.
    style: { branding: { primaryButton: { backgroundColor: "#cc007e", color: "#ffffff" } } },
  });

  session.on("ready", options.onReady);
  session.on("sessionEnd", options.onSessionEnd);
  session.mount(options.container);

  // The library sizes its frame to DocuSign's page, whose height is in turn
  // the frame's — so it settles at the library's 400px floor. Keeping the
  // frame at least as tall as the container gives the ceremony the screen.
  const fit = () => {
    const frame = options.container.querySelector("iframe");
    if (frame && options.container.clientHeight > 0) frame.style.minHeight = `${options.container.clientHeight}px`;
  };
  fit();
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
  observer?.observe(options.container);

  return {
    destroy: () => {
      observer?.disconnect();
      try {
        session.destroy();
      } catch {
        // The library removes its own frame after a session ends; a second removal is not an error.
      }
    },
  };
}

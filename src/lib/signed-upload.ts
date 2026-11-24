/**
 * Uploads one file to a Storage signed-upload URL, reporting the bytes sent and
 * honouring an AbortSignal.
 *
 * It is the request supabase-js `uploadToSignedUrl` makes — a PUT of a
 * multipart body to `/storage/v1/object/upload/sign/<bucket>/<key>?token=…`,
 * with the cache-control field first and the file after it — sent through
 * XMLHttpRequest instead of fetch. fetch cannot report upload progress, and
 * supabase-js accepts no AbortSignal on this call, so neither a real percentage
 * nor a real cancel was possible through it. The token is still the only thing
 * that authorises the write: the bucket stays private and the key is the one the
 * backend minted (POST /intake/documents/upload-url).
 */

export interface UploadBytes {
  loaded: number;
  total: number;
}

export interface SignedUploadRequest {
  bucket: string;
  storagePath: string;
  token: string;
  file: Blob;
  cacheControl?: string;
  upsert?: boolean;
  signal?: AbortSignal;
  onProgress?: (bytes: UploadBytes) => void;
}

/** The patient stopped the upload. Not a failure, and never shown as one. */
export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelledError";
  }
}

export const isUploadCancelled = (error: unknown): error is UploadCancelledError =>
  error instanceof UploadCancelledError;

/**
 * The upload failed. `answered` says whether Storage replied: a reply means it
 * refused the write and kept nothing, while a dropped connection leaves it
 * unknown whether the object landed before the line went.
 */
export class UploadRequestError extends Error {
  readonly answered: boolean;

  constructor(message: string, answered: boolean) {
    super(message);
    this.name = "UploadRequestError";
    this.answered = answered;
  }
}

const storageUrl = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1`;

function signedUploadUrl(bucket: string, storagePath: string, token: string): string {
  const key = storagePath.replace(/^\/+/, "");
  const url = new URL(`${storageUrl()}/object/upload/sign/${bucket}/${key}`);
  url.searchParams.set("token", token);
  return url.toString();
}

function failureMessage(xhr: XMLHttpRequest): string {
  try {
    const body = JSON.parse(xhr.responseText) as { message?: unknown; error?: unknown };
    if (typeof body.message === "string" && body.message) return body.message;
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // not JSON — fall through to the status
  }
  return `Upload failed with status ${xhr.status}`;
}

export function uploadToSignedUrl({
  bucket,
  storagePath,
  token,
  file,
  cacheControl = "3600",
  upsert = false,
  signal,
  onProgress,
}: SignedUploadRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }

    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = () => signal?.removeEventListener("abort", abort);

    xhr.open("PUT", signedUploadUrl(bucket, storagePath, token));
    // The publishable key, as every Storage request from the browser carries it;
    // the token in the URL is what authorises this one.
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "");
    xhr.setRequestHeader("x-upsert", String(upsert));

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({ loaded: event.loaded, total: event.total });
    };
    // The request body has gone in full. A small payload — a photo once it is
    // re-encoded — can be sent between two progress events; this is the one
    // report that it all went, before Storage's answer completes the upload.
    xhr.upload.onload = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({ loaded: event.total, total: event.total });
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadRequestError(failureMessage(xhr), true));
    };
    xhr.onerror = () => {
      done();
      reject(new UploadRequestError("Network error during upload", false));
    };
    xhr.onabort = () => {
      done();
      reject(new UploadCancelledError());
    };

    signal?.addEventListener("abort", abort, { once: true });

    const body = new FormData();
    body.append("cacheControl", cacheControl);
    body.append("", file);
    xhr.send(body);
  });
}

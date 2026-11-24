import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone, type FileError, type FileRejection } from "react-dropzone";

import { isUploadCancelled, UploadRequestError, uploadToSignedUrl, type UploadBytes } from "@/lib/signed-upload";
import { createClient } from "@/lib/supabase/client";
import { nextRate, openRequestPercent, secondsRemaining, timeLeftLabel, type TimeLeft } from "@/lib/upload-progress";

const supabase = createClient();

const WEBP_QUALITY = 0.82;
const MAX_IMAGE_DIMENSION = 2048;

const normalizeStoragePath = (bucketName: string, storagePath: string) => {
  const withoutLeadingSlash = storagePath.replace(/^\/+/, "");
  if (withoutLeadingSlash.startsWith(`${bucketName}/`)) {
    return withoutLeadingSlash.slice(bucketName.length + 1);
  }
  return withoutLeadingSlash;
};

interface FileWithPreview extends File {
  preview?: string;
  storagePath?: string;
  errors: readonly FileError[];
}

/**
 * `report.pdf` again becomes `report (2).pdf`.
 *
 * The object key the backend mints is unique either way; this is so the two
 * files are tellable apart in the list, and so the name-keyed bookkeeping
 * around them cannot confuse one for the other.
 */
const nextFreeName = (name: string, taken: Set<string>) => {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} (${n})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
};

const canConvertToWebp = (file: File) => {
  if (!file.type.startsWith("image/")) return false;
  if (file.type === "image/webp") return false;
  // Keep SVG and GIF in their original formats.
  if (file.type === "image/svg+xml" || file.type === "image/gif") return false;
  return true;
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    image.src = url;
  });

// Also used by Case Summary's document sheet, so a photo added there is sent the same way.
export const convertImageToWebp = async (file: File): Promise<File> => {
  if (!canConvertToWebp(file)) {
    return file;
  }

  const image = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create canvas context");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY);
  });

  if (!blob) {
    throw new Error("Could not encode image as webp");
  }

  // Keep the original file name to avoid breaking signed-upload key contracts.
  if (blob.size >= file.size) {
    return file;
  }

  return new File([blob], file.name, {
    type: "image/webp",
    lastModified: file.lastModified,
  });
};

type UseSupabaseUploadOptions = {
  /**
   * Name of bucket to upload files to in your Supabase project
   */
  bucketName: string;
  /**
   * Folder to upload files to in the specified bucket within your Supabase project.
   *
   * Defaults to uploading files to the root of the bucket
   *
   * e.g If specified path is `test`, your file will be uploaded as `test/file_name`
   */
  path?: string;
  /**
   * Allowed MIME types for each file upload (e.g `image/png`, `text/html`, etc). Wildcards are also supported (e.g `image/*`).
   *
   * Defaults to allowing uploading of all MIME types.
   */
  allowedMimeTypes?: string[];
  /**
   * Maximum upload size of each file allowed in bytes. (e.g 1000 bytes = 1 KB)
   */
  maxFileSize?: number;
  /**
   * Maximum number of files allowed per upload.
   */
  maxFiles?: number;
  /**
   * The number of seconds the asset is cached in the browser and in the Supabase CDN.
   *
   * This is set in the Cache-Control: max-age=<seconds> header. Defaults to 3600 seconds.
   */
  cacheControl?: number;
  /**
   * When set to true, the file is overwritten if it exists.
   *
   * When set to false, an error is thrown if the object already exists. Defaults to `false`
   */
  upsert?: boolean;
  /**
   * Resolves the object key and upload token for a file when the bucket does not
   * accept unauthenticated writes. When omitted the file is uploaded directly.
   */
  getSignedUpload?: (file: File) => Promise<{ storagePath: string; token: string }>;
  /**
   * Deletes an already uploaded file from storage using a backend-authoritative path.
   * Required to guarantee delete correctness for signed uploads on private buckets.
   */
  deleteUploadedFile?: (file: { name: string; storagePath: string }) => Promise<void>;
  /**
   * Rewrites a rejection into copy the patient can act on.
   *
   * react-dropzone's own messages are English and describe the accept list
   * ("File type must be image/*, application/pdf"), which is neither
   * translatable nor meaningful to someone who just chose a video. The caller
   * holds the translations, so it supplies the message.
   */
  getErrorMessage?: (error: FileError, file: File) => string;
  /**
   * Called when the native picker closed without returning a file.
   *
   * There is no cancel event on the input itself; react-dropzone infers it from
   * the window regaining focus with the input still empty.
   */
  onFileDialogCancel?: () => void;
  /**
   * Names already in use outside the working list — documents attached in an
   * earlier round. A new file arriving under one of them is renamed the same
   * way as a clash inside the list, so the two stay tellable apart.
   */
  reservedNames?: readonly string[];
};

type UseSupabaseUploadReturn = ReturnType<typeof useSupabaseUpload>;

/**
 * One file's upload as the browser reports it, ready to draw. It exists from
 * the moment the file is queued: before its first byte goes — while a photo is
 * re-encoded, while its upload URL is minted — it is 0% with `sending` false.
 */
type FileUploadProgress = {
  loaded: number;
  total: number;
  percent: number;
  timeLeft: TimeLeft | null;
  sending: boolean;
};

type RateTrack = { startedAt: number; last: { loaded: number; at: number }; rate: number | null };

const useSupabaseUpload = (options: UseSupabaseUploadOptions) => {
  const {
    bucketName,
    path,
    allowedMimeTypes = [],
    maxFileSize = Number.POSITIVE_INFINITY,
    maxFiles = 1,
    cacheControl = 3600,
    upsert = false,
    getSignedUpload,
    deleteUploadedFile,
    getErrorMessage,
    onFileDialogCancel,
    reservedNames,
  } = options;

  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([]);
  const [successes, setSuccesses] = useState<string[]>([]);
  const [uploadedStoragePaths, setUploadedStoragePaths] = useState<Record<string, string>>({});
  // Bytes sent per file, by name, while its request is open.
  const [progress, setProgress] = useState<Record<string, FileUploadProgress>>({});

  // Each round of uploads runs under a generation. Cancelling moves the
  // generation on, so a request that finishes afterwards — the response was
  // already on its way at 95% — finds itself stale and is undone rather than
  // recorded, whatever order the abort and the response land in.
  const generationRef = useRef(0);
  const controllersRef = useRef(new Map<string, AbortController>());
  const ratesRef = useRef(new Map<string, RateTrack>());

  const removeFile = useCallback(
    async (fileName: string) => {
      const removeFromLocalState = () => {
        setFiles((prev) => prev.filter((file) => file.name !== fileName));
        setErrors((prev) => prev.filter((error) => error.name !== fileName));
        setSuccesses((prev) => prev.filter((name) => name !== fileName));
        setUploadedStoragePaths((prev) => {
          const next = { ...prev };
          delete next[fileName];
          return next;
        });
      };

      const wasUploaded = successes.includes(fileName);
      if (!wasUploaded) {
        removeFromLocalState();
        return;
      }

      const uploadedFile = files.find((file) => file.name === fileName);
      const storagePath = uploadedFile?.storagePath ?? uploadedStoragePaths[fileName];

      if (!storagePath) {
        setErrors((prev) => {
          const withoutExisting = prev.filter((entry) => entry.name !== fileName);
          return [...withoutExisting, { name: fileName, message: "Delete failed: file location is unknown" }];
        });
        return;
      }

      if (getSignedUpload && !deleteUploadedFile) {
        setErrors((prev) => {
          const withoutExisting = prev.filter((entry) => entry.name !== fileName);
          return [
            ...withoutExisting,
            {
              name: fileName,
              message: "Delete unavailable: private uploads require backend delete support",
            },
          ];
        });
        return;
      }

      if (deleteUploadedFile) {
        try {
          await deleteUploadedFile({ name: fileName, storagePath });
          removeFromLocalState();
        } catch (error) {
          setErrors((prev) => {
            const withoutExisting = prev.filter((entry) => entry.name !== fileName);
            return [...withoutExisting, { name: fileName, message: `Delete failed: ${(error as Error).message}` }];
          });
        }
        return;
      }

      const normalizedStoragePath = normalizeStoragePath(bucketName, storagePath);
      const { error } = await supabase.storage.from(bucketName).remove([normalizedStoragePath]);

      if (error) {
        setErrors((prev) => {
          const withoutExisting = prev.filter((entry) => entry.name !== fileName);
          return [...withoutExisting, { name: fileName, message: `Delete failed: ${error.message}` }];
        });
        return;
      }

      removeFromLocalState();
    },
    [bucketName, deleteUploadedFile, files, getSignedUpload, successes, uploadedStoragePaths]
  );

  const isSuccess = useMemo(() => {
    if (errors.length === 0 && successes.length === 0) {
      return false;
    }
    if (errors.length === 0 && successes.length === files.length) {
      return true;
    }
    return false;
  }, [errors.length, successes.length, files.length]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      // Everything here is keyed by file name — the working list, the successes,
      // the errors, the delete. A second file arriving under a name the list
      // already holds used to be dropped on the floor, silently: iOS names every
      // camera capture `image.jpg`, so the second photo in a category simply
      // never uploaded. It is taken in under a free name instead.
      const taken = new Set([...(reservedNames ?? []), ...files.map((file) => file.name)]);
      const validFiles = acceptedFiles.map((file) => {
        const name = nextFreeName(file.name, taken);
        taken.add(name);
        const accepted =
          name === file.name ? file : new File([file], name, { type: file.type, lastModified: file.lastModified });
        (accepted as unknown as FileWithPreview).preview = URL.createObjectURL(accepted);
        (accepted as unknown as FileWithPreview).errors = [];
        return accepted as unknown as FileWithPreview;
      });

      const invalidFiles = fileRejections.map(({ file, errors }) => {
        (file as unknown as FileWithPreview).preview = URL.createObjectURL(file);
        (file as unknown as FileWithPreview).errors = errors;
        return file as unknown as FileWithPreview;
      });

      const newFiles = [...files, ...validFiles, ...invalidFiles];

      setFiles(newFiles);
    },
    [files, reservedNames, setFiles]
  );

  const dropzoneProps = useDropzone({
    onDrop,
    noClick: true,
    // Always go through the hidden <input>. The File System Access API ignores
    // `capture`, so opting into it would silently turn "Take a photo" into a
    // file browser on the browsers that have it.
    useFsAccessApi: false,
    accept: allowedMimeTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxFileSize,
    maxFiles: maxFiles,
    multiple: maxFiles !== 1,
    getErrorMessage,
    onFileDialogCancel,
  });

  const reportProgress = useCallback((name: string, generation: number, bytes: UploadBytes) => {
    if (generationRef.current !== generation) return;
    const now = Date.now();
    const sample = { loaded: bytes.loaded, at: now };
    const previous = ratesRef.current.get(name);
    const track: RateTrack = previous
      ? { startedAt: previous.startedAt, last: sample, rate: nextRate(previous.rate, previous.last, sample) }
      : { startedAt: now, last: sample, rate: null };
    ratesRef.current.set(name, track);
    const seconds = secondsRemaining(bytes.loaded, bytes.total, track.rate);
    setProgress((prev) => ({
      ...prev,
      [name]: {
        loaded: bytes.loaded,
        total: bytes.total,
        // the bytes sent so far, held below 100 until Storage answers, and
        // never shown going back
        percent: Math.max(prev[name]?.percent ?? 0, openRequestPercent(bytes.loaded, bytes.total)),
        timeLeft: timeLeftLabel(seconds, now - track.startedAt),
        sending: true,
      },
    }));
  }, []);

  // Storage has answered: the upload is complete, and only now reads 100%.
  const reportComplete = useCallback((name: string, generation: number) => {
    if (generationRef.current !== generation) return;
    ratesRef.current.delete(name);
    setProgress((prev) => {
      const current = prev[name];
      if (!current) return prev;
      return { ...prev, [name]: { ...current, loaded: current.total, percent: 100, timeLeft: null, sending: true } };
    });
  }, []);

  /**
   * Stops every upload this hook has in flight. Requests are aborted, their
   * progress goes, and nothing they return from here on is recorded — not as a
   * success and not as an error: the patient stopped them. Any object that did
   * reach Storage before the abort is deleted by the upload that made it.
   */
  const cancel = useCallback(() => {
    generationRef.current += 1;
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
    ratesRef.current.clear();
    setProgress({});
    setLoading(false);
  }, []);

  const onUpload = useCallback(async () => {
    const generation = generationRef.current;
    const stale = () => generationRef.current !== generation;
    setLoading(true);

    try {
      // [Joshen] This is to support handling partial successes
      // If any files didn't upload for any reason, hitting "Upload" again will only upload the files that had errors
      const filesWithErrors = new Set(errors.map((x) => x.name));
      const filesToUpload = files.filter((file) => {
        // A file the picker's validation refused (wrong type, too large, one
        // too many) is shown so it can be removed; it is never sent.
        if (file.errors.length > 0) return false;
        if (filesWithErrors.size > 0) {
          // Retry errored files and include any file that has not succeeded yet,
          // but never re-upload already successful files.
          return filesWithErrors.has(file.name) || !successes.includes(file.name);
        }
        return !successes.includes(file.name);
      });

      if (filesToUpload.length === 0) {
        return;
      }

      // Every queued file has a row at 0% straight away. A photo is re-encoded
      // before it is sent, which takes a moment on a phone; the row says
      // nothing has gone yet rather than showing a bare spinner.
      setProgress((prev) => ({
        ...prev,
        ...Object.fromEntries(
          filesToUpload.map((file) => [
            file.name,
            { loaded: 0, total: file.size, percent: 0, timeLeft: null, sending: false } satisfies FileUploadProgress,
          ])
        ),
      }));

      const preparedUploads = await Promise.all(
        filesToUpload.map(async (file) => {
          try {
            const uploadFile = await convertImageToWebp(file);
            return { originalFile: file, uploadFile };
          } catch {
            // Fall back to the original file if browser conversion fails.
            return { originalFile: file, uploadFile: file };
          }
        })
      );
      if (stale()) return;

      // A key the backend minted for this round, by file name: what to delete
      // if the upload behind it fails or is cancelled.
      const mintedPaths = new Map<string, string>();

      const responses = await Promise.all(
        preparedUploads.map(
          async ({
            originalFile,
            uploadFile,
          }): Promise<{
            name: string;
            message?: string;
            storagePath?: string;
            cancelled?: true;
            // a failure Storage did not answer: the object may have landed
            unconfirmed?: true;
          }> => {
            if (getSignedUpload) {
              const controller = new AbortController();
              controllersRef.current.set(originalFile.name, controller);
              try {
                const { storagePath, token } = await getSignedUpload(uploadFile);
                const normalized = normalizeStoragePath(bucketName, storagePath);
                mintedPaths.set(originalFile.name, normalized);
                if (stale()) return { name: originalFile.name, cancelled: true };
                await uploadToSignedUrl({
                  bucket: bucketName,
                  storagePath: normalized,
                  token,
                  file: uploadFile,
                  cacheControl: cacheControl.toString(),
                  upsert,
                  signal: controller.signal,
                  onProgress: (bytes) => reportProgress(originalFile.name, generation, bytes),
                });
                reportComplete(originalFile.name, generation);
                return { name: originalFile.name, storagePath: normalized };
              } catch (error) {
                if (isUploadCancelled(error) || stale()) return { name: originalFile.name, cancelled: true };
                const answered = error instanceof UploadRequestError && error.answered;
                return {
                  name: originalFile.name,
                  message: (error as Error).message,
                  ...(answered ? {} : { unconfirmed: true as const }),
                };
              } finally {
                if (controllersRef.current.get(originalFile.name) === controller) {
                  controllersRef.current.delete(originalFile.name);
                }
              }
            }

            const storagePath = !!path ? `${path}/${uploadFile.name}` : uploadFile.name;
            const { error } = await supabase.storage.from(bucketName).upload(storagePath, uploadFile, {
              cacheControl: cacheControl.toString(),
              upsert,
            });
            if (error) {
              return { name: originalFile.name, message: error.message };
            }
            return {
              name: originalFile.name,
              message: undefined,
              storagePath: normalizeStoragePath(bucketName, storagePath),
            };
          }
        )
      );

      // Nothing stopped or lost may leave an object behind. An aborted request
      // usually never wrote one, and a delete of a key that is not there is
      // harmless; one that completed just as Cancel landed did, and so may one
      // whose connection dropped before Storage answered. A failure Storage
      // answered kept nothing, so it asks nothing of the backend.
      const leftBehind = responses.filter((response) => stale() || response.cancelled || response.unconfirmed);
      for (const response of leftBehind) {
        const minted = mintedPaths.get(response.name);
        if (minted && deleteUploadedFile) {
          void deleteUploadedFile({ name: response.name, storagePath: minted }).catch(() => {});
        }
      }
      if (stale()) return;

      for (const response of responses) ratesRef.current.delete(response.name);
      setProgress((prev) => {
        const next = { ...prev };
        for (const response of responses) delete next[response.name];
        return next;
      });

      const convertedByName = new Map(
        preparedUploads.map(({ originalFile, uploadFile }) => [originalFile.name, uploadFile])
      );
      const storagePathByName = new Map(
        responses
          .filter(
            (response): response is { name: string; storagePath: string } =>
              response.message === undefined && !response.cancelled && typeof response.storagePath === "string"
          )
          .map((response) => [response.name, response.storagePath])
      );
      setFiles((prevFiles) =>
        prevFiles.map((file) => {
          const converted = convertedByName.get(file.name);
          const storagePath = storagePathByName.get(file.name);
          if (!converted || converted === file) {
            if (storagePath) {
              (file as FileWithPreview).storagePath = storagePath;
            }
            return file;
          }
          (converted as FileWithPreview).preview = file.preview ?? URL.createObjectURL(converted);
          (converted as FileWithPreview).errors = file.errors;
          (converted as FileWithPreview).storagePath = storagePath;
          return converted as FileWithPreview;
        })
      );

      const responseErrors = responses
        .filter((x) => x.message !== undefined)
        .map((x) => ({ name: x.name, message: x.message as string }));
      // if there were errors previously, this function tried to upload the files again so we should clear/overwrite the existing errors.
      setErrors(responseErrors);

      const responseSuccesses = responses.filter((x) => x.message === undefined && !x.cancelled);
      const newSuccesses = Array.from(new Set([...successes, ...responseSuccesses.map((x) => x.name)]));
      setSuccesses(newSuccesses);
      const uploadedPathEntries = responseSuccesses
        .filter((x): x is { name: string; storagePath: string } => typeof x.storagePath === "string")
        .map((x) => [x.name, x.storagePath] as const);
      if (uploadedPathEntries.length > 0) {
        setUploadedStoragePaths((prev) => ({
          ...prev,
          ...Object.fromEntries(uploadedPathEntries),
        }));
      }
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [
    files,
    path,
    bucketName,
    errors,
    successes,
    cacheControl,
    upsert,
    getSignedUpload,
    deleteUploadedFile,
    reportProgress,
    reportComplete,
  ]);

  // Clears the working list. Anything still going up is cancelled first, so a
  // reset can never leave an upload running with nothing left to record it.
  const reset = useCallback(() => {
    cancel();
    setFiles([]);
    setErrors([]);
    setSuccesses([]);
    setUploadedStoragePaths({});
  }, [cancel]);

  useEffect(() => {
    if (files.length === 0) {
      setErrors([]);
    }

    // If the number of files doesn't exceed the maxFiles parameter, remove the error 'Too many files' from each file
    if (files.length <= maxFiles) {
      let changed = false;
      const newFiles = files.map((file) => {
        if (file.errors.some((e) => e.code === "too-many-files")) {
          file.errors = file.errors.filter((e) => e.code !== "too-many-files");
          changed = true;
        }
        return file;
      });
      if (changed) {
        setFiles(newFiles);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, setFiles, maxFiles]);

  return {
    files,
    setFiles,
    removeFile,
    successes,
    isSuccess,
    loading,
    errors,
    setErrors,
    setSuccesses,
    reset,
    cancel,
    progress,
    onUpload,
    maxFileSize: maxFileSize,
    maxFiles: maxFiles,
    allowedMimeTypes,
    ...dropzoneProps,
  };
};

export { useSupabaseUpload, type FileUploadProgress, type UseSupabaseUploadOptions, type UseSupabaseUploadReturn };

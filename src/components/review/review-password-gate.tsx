"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ReviewPasswordGate({
  claimantUserId,
  submissionId,
  initialToken,
}: {
  claimantUserId: string;
  submissionId: string;
  initialToken: string;
}) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submitToken = async (tokenValue: string) => {
    if (!tokenValue.trim()) {
      setError("Missing access token.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/review/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimantUserId, submissionId, token: tokenValue }),
      });

      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!response.ok || !body?.ok) {
        setError("Access link is invalid, expired, or revoked.");
        return;
      }

      const cleanedPath =
        window.location.pathname +
        (window.location.search
          ? window.location.search
              .replace(/([?&])t=[^&]*(&?)/, (match, p1, p2) => (p1 === "?" && p2 ? "?" : ""))
              .replace(/[?&]$/, "")
          : "");
      router.replace(cleanedPath || window.location.pathname);
      window.location.reload();
    } catch {
      setError("Could not verify access token right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitToken(token);
  };

  useEffect(() => {
    if (!initialToken) return;
    void submitToken(initialToken);
    // initialToken is intentionally used once on first mount to auto-unlock link access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-neutral-900">Protected Review Page</h1>
        <p className="mt-2 text-sm text-neutral-600">Enter the access token to unlock this review.</p>

        <form
          onSubmit={onSubmit}
          className="mt-5 space-y-3"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Access Token
            </span>
            <input
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none ring-[#cc007e] focus:ring-2"
              autoComplete="off"
              required
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#cc007e] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Unlocking..." : "Unlock Review"}
          </button>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}

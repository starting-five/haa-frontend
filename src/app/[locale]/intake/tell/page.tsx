"use client";

import { ScreenFooter } from "@/components/layout/screen-footer";
import { ScreenHeader } from "@/components/layout/screen-header";
import { StatusBarPlaceholder } from "@/components/layout/status-bar-placeholder";
import { useRequireSessionKey } from "@/hooks/use-require-session-key";
import { useSpeechDictation, type DictationFailure } from "@/hooks/use-speech-dictation";
import { SUPPORT_PHONE_TEL } from "@/lib/constants";
import { Headphones, Keyboard, Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

// Each failure the dictation hook can report, in the patient's words.
const DICTATION_FAILURE_KEYS: Record<DictationFailure, string> = {
  unsupported: "micUnsupported",
  "insecure-context": "micInsecureContext",
  permission: "micPermissionNeeded",
  "no-microphone": "micUnavailable",
  network: "micNetwork",
  "no-speech": "micNoSpeech",
  unknown: "micError",
};

export default function IntakeTellPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "en";
  const router = useRouter();
  const t = useTranslations("IntakeTell");
  const tc = useTranslations("Common");

  useRequireSessionKey("intake_choosePath", "/intake/choose-path");

  const [mode, setMode] = useState<"choice" | "mic" | "editor">("choice");
  const [activeChoiceCta, setActiveChoiceCta] = useState<"mic" | "keyboard" | "headphones">("mic");
  const [storyDraft, setStoryDraft] = useState("");
  const [error, setError] = useState("");
  const canContinue = storyDraft.trim().length > 0;

  const appendTranscript = useCallback((rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    setStoryDraft((previous) => {
      const trimmedPrevious = previous.trim();
      return trimmedPrevious ? `${trimmedPrevious} ${text}` : text;
    });
    setError("");
  }, []);

  const dictation = useSpeechDictation({
    lang: locale === "es" ? "es-ES" : "en-US",
    onFinal: appendTranscript,
  });
  const { listening, interim: interimTranscript, failure: dictationFailure } = dictation;
  const dictationMessage = dictationFailure ? t(DICTATION_FAILURE_KEYS[dictationFailure]) : "";

  const handleContinue = () => {
    const value = storyDraft.trim();
    if (!value) {
      setError(t("required"));
      return;
    }
    sessionStorage.setItem("intake_description", value);
    router.push(`/${locale}/intake/injury`);
  };

  const handleMicClick = () => {
    setActiveChoiceCta("mic");
    setError("");
    setMode("mic");
  };

  const startRecording = () => {
    setError("");
    dictation.toggle();
  };

  const handleKeyboardClick = () => {
    setActiveChoiceCta("keyboard");
    dictation.stop();
    dictation.clearFailure();
    setError("");
    setMode("editor");
  };

  const handleHeadphonesClick = () => {
    setActiveChoiceCta("headphones");
    dictation.stop();
    dictation.clearFailure();
    setError("");
    window.location.href = SUPPORT_PHONE_TEL;
  };

  return (
    <div className="h-dvh flex flex-col w-full md:max-w-[720px] mx-auto bg-white relative">
      <StatusBarPlaceholder />
      <ScreenHeader showLanguageSelector={false} />

      <form
        id="tell-form"
        className="flex-1 overflow-y-auto px-[24px] pt-[32px]"
        onSubmit={(event) => {
          event.preventDefault();
          handleContinue();
        }}
      >
        <h1
          className="text-[28px] font-extrabold text-[#111] leading-none mb-[6px]"
          style={{ fontFamily: "var(--font-nunito-sans)" }}
        >
          {t("heading")}
        </h1>
        {/* Figma 1949:3982 — Subtitle/Regular: Inter 16/400 in the subtitle grey */}
        <p
          className="mb-[20px] text-[16px] font-normal text-[#5c5c5c]"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {t("subtext")}
        </p>

        {mode === "choice" && (
          <div className="mb-[20px] flex flex-col items-center gap-[12px]">
            <Image
              src="/assets/intake/mic-hero.webp"
              alt=""
              width={480}
              height={720}
              priority
              unoptimized
              decoding="sync"
              className="h-[360px] w-[240px] object-contain"
            />
            <div className="flex w-full flex-col gap-[12px]">
              <button
                type="button"
                onClick={handleMicClick}
                aria-label={t("micMode")}
                aria-pressed={activeChoiceCta === "mic"}
                className={`flex h-[56px] w-full items-center justify-center gap-[10px] self-stretch rounded-[16px] px-[24px] text-center transition-colors ${
                  activeChoiceCta === "mic"
                    ? "bg-brand text-white"
                    : "border border-[#dedede] bg-white text-[#111] hover:border-brand hover:bg-brand hover:text-white"
                }`}
              >
                <Mic size={20} />
                <span className="text-[14px] font-medium leading-normal">{t("micMode")}</span>
              </button>
              <button
                type="button"
                onClick={handleKeyboardClick}
                aria-label={t("keyboardMode")}
                aria-pressed={activeChoiceCta === "keyboard"}
                className={`flex h-[56px] w-full items-center justify-center gap-[10px] self-stretch rounded-[16px] px-[24px] text-center transition-colors ${
                  activeChoiceCta === "keyboard"
                    ? "bg-brand text-white"
                    : "border border-[#dedede] bg-white text-[#111] hover:border-brand hover:bg-brand hover:text-white"
                }`}
              >
                <Keyboard size={20} />
                <span className="text-[14px] font-medium leading-normal">{t("keyboardMode")}</span>
              </button>
              <button
                type="button"
                onClick={handleHeadphonesClick}
                aria-label={t("headphonesMode")}
                aria-pressed={activeChoiceCta === "headphones"}
                className={`flex h-[56px] w-full items-center justify-center gap-[10px] self-stretch rounded-[16px] px-[24px] text-center transition-colors ${
                  activeChoiceCta === "headphones"
                    ? "bg-brand text-white"
                    : "border border-[#dedede] bg-white text-[#111] hover:border-brand hover:bg-brand hover:text-white"
                }`}
              >
                <Headphones size={20} />
                <span className="text-[14px] font-medium leading-normal">{t("headphonesMode")}</span>
              </button>
            </div>
          </div>
        )}

        {mode !== "choice" && (
          <div className="mb-[20px] flex flex-col gap-[12px]">
            {(mode === "mic" || mode === "editor") && (
              <div
                className={`relative rounded-[12px] border bg-white p-[12px] ${
                  error || dictationMessage ? "border-[#cc007e]" : "border-[#dedede] focus-within:border-[#cc007e]"
                }`}
              >
                {mode === "mic" && (
                  <button
                    type="button"
                    onClick={startRecording}
                    aria-label={listening ? t("stopRecording") : t("tapToTalk")}
                    title={listening ? t("stopRecording") : t("tapToTalk")}
                    className={`absolute right-[12px] top-[12px] rounded-full p-[7px] ${
                      listening ? "bg-[#cc007e] text-white" : "bg-[#f2f2f7] text-[#6e6e73]"
                    }`}
                  >
                    <Mic size={16} />
                  </button>
                )}

                <textarea
                  value={storyDraft}
                  onChange={(event) => {
                    setStoryDraft(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder={t("textareaPlaceholder")}
                  className={`h-[180px] w-full resize-none bg-transparent text-[15px] text-[#111] outline-none placeholder:text-[#8d8d8d] ${
                    mode === "mic" ? "pr-[40px]" : ""
                  }`}
                />
              </div>
            )}

            {mode === "mic" && (interimTranscript || listening) && (
              <p className="text-[12px] text-[#8d8d8d]">{interimTranscript || t("listening")}</p>
            )}
          </div>
        )}

        {(error || dictationMessage) && (
          <p
            role="status"
            className="text-[12px] text-[#cc007e]"
          >
            {error || dictationMessage}
          </p>
        )}
      </form>

      {mode !== "choice" && (
        <ScreenFooter
          label={tc("continue")}
          formId="tell-form"
          disabled={!canContinue}
        />
      )}
    </div>
  );
}

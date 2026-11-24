import { SeverityNumber } from "@opentelemetry/api-logs";
import { posthogLogProvider } from "../../instrumentation";

const posthogLogger = posthogLogProvider?.getLogger("haa-posthog-integration");

export function emitPosthogIntegrationLog(
  body: string,
  severityNumber: SeverityNumber,
  attributes: Record<string, string | number | boolean>
) {
  posthogLogger?.emit({ body, severityNumber, attributes });
}

export async function flushPosthogIntegrationLogs() {
  await posthogLogProvider?.forceFlush();
}

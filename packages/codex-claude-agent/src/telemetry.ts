import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

export interface TelemetryHandle {
  shutdown(): Promise<void>;
}

export async function initializeTelemetry(
  env: NodeJS.ProcessEnv = process.env,
): Promise<TelemetryHandle | undefined> {
  if (
    env.OTEL_SDK_DISABLED === "true" ||
    (!env.OTEL_EXPORTER_OTLP_ENDPOINT &&
      !env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT)
  ) {
    return undefined;
  }
  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME ?? "codex-claude-agent",
    traceExporter: new OTLPTraceExporter(),
  });
  await sdk.start();
  return { shutdown: () => sdk.shutdown() };
}

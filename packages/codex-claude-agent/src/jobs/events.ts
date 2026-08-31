import { constants } from "node:fs";

import type { StreamEvent } from "../schema.js";
import { openFileNoFollow } from "../utils/secure-files.js";
import { resolveJobPaths } from "./paths.js";
import { ensureSecureDirectory } from "./storage.js";

export interface JobEventWriter {
  append(event: StreamEvent): Promise<void>;
  close(): Promise<void>;
}

function sanitizedEvent(event: StreamEvent): StreamEvent {
  const data = event.data;
  if (!data) return event;
  if (event.type === "tool_use") {
    return {
      ...event,
      data: {
        id: typeof data.id === "string" ? data.id : undefined,
        name: typeof data.name === "string" ? data.name : undefined,
      },
    };
  }
  if (event.type === "tool_result") {
    return {
      ...event,
      data: {
        toolUseId:
          typeof data.toolUseId === "string" ? data.toolUseId : undefined,
        isError: data.isError === true,
      },
    };
  }
  if (event.type === "text_delta") {
    return {
      ...event,
      data: {
        characters:
          typeof data.text === "string" ? data.text.length : undefined,
      },
    };
  }
  return event;
}

export async function appendEvent(
  repoRoot: string,
  jobId: string,
  event: StreamEvent,
): Promise<void> {
  const writer = await createJobEventWriter(repoRoot, jobId);
  try {
    await writer.append(event);
  } finally {
    await writer.close();
  }
}

export async function createJobEventWriter(
  repoRoot: string,
  jobId: string,
): Promise<JobEventWriter> {
  const { logPath, jobsDir } = resolveJobPaths(repoRoot, jobId);
  await ensureSecureDirectory(jobsDir);
  const handle = await openFileNoFollow(
    logPath,
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT,
    0o600,
  );
  return {
    append: async (event) =>
      handle.writeFile(`${JSON.stringify(sanitizedEvent(event))}\n`),
    close: async () => handle.close(),
  };
}

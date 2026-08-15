import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { listJobs, readJob, readReport } from "./jobstore.js";
import { elapsed } from "./jobs.js";

/**
 * Reports are exposed as resources so clients can read them without burning
 * a tool call (and so users can @-mention them where supported).
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    "jobs",
    "research://jobs",
    {
      title: "Deep research jobs",
      description:
        "All known research jobs, newest first, with status and report paths.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            listJobs().map((job) => ({
              job_id: job.jobId,
              status: job.status,
              depth: job.depth,
              query: job.query,
              created_at: job.createdAt,
              elapsed: elapsed(job),
              report_ready: Boolean(job.reportPath),
              report_uri: `research://job/${job.jobId}`,
            })),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerResource(
    "job-report",
    new ResourceTemplate("research://job/{job_id}", {
      list: async () => ({
        resources: listJobs()
          .filter((job) => job.reportPath)
          .map((job) => ({
            uri: `research://job/${job.jobId}`,
            name: `Report: ${job.query.slice(0, 60)}`,
            mimeType: "text/markdown",
          })),
      }),
      complete: {
        job_id: (value) =>
          listJobs()
            .map((job) => job.jobId)
            .filter((id) => id.startsWith(value)),
      },
    }),
    {
      title: "Deep research report",
      description: "Full markdown report for a research job.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const jobId = String(variables.job_id ?? "");
      const job = readJob(jobId);
      const report = job ? readReport(jobId) : undefined;
      const text = !job
        ? `No job "${jobId}" found.`
        : (report ??
          `Job ${jobId} is ${job.status} (${elapsed(job)} elapsed); no report yet.`);
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
      };
    },
  );
}

import { beforeEach, describe, expect, it, vi } from "vitest";

import { enqueueScheduledReport, getScheduledReportId } from "../services/scheduled-report-service";

import {
  enqueueEmailForCompletedReport,
  processScheduledReportEmail,
  registerScheduledReportSchedules
} from "./scheduled-report-cron";

import type {
  ScheduledReportConfig,
  ScheduledReportRecord
} from "../types/scheduled-report";

const emailConfig = {
  host: "smtp.example.test",
  port: 587,
  secure: false,
  from: "reports@example.test",
  recipients: ["executive@example.test"],
  subjectPrefix: "Petakeu"
};

function enabledConfig(): ScheduledReportConfig {
  return {
    enabled: true,
    timezone: "Asia/Jakarta",
    regionIds: ["region-1"],
    schedules: [
      { cadence: "weekly", expression: "0 9 * * 1" },
      { cadence: "monthly", expression: "0 9 1 * *" }
    ],
    email: emailConfig,
    disabledReasons: []
  };
}

describe("scheduled report runtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("registers each configured cadence and closes its tasks", async () => {
    const handlers: Array<() => Promise<void>> = [];
    const stop = vi.fn();
    const registration = registerScheduledReportSchedules(
      enabledConfig(),
      vi.fn().mockResolvedValue(undefined),
      {
        schedule: vi.fn((_expression, handler) => {
          handlers.push(handler);
          return { stop };
        })
      }
    );

    expect(registration.tasks).toHaveLength(2);
    expect(handlers).toHaveLength(2);
    await registration.close();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("inserts and queues one deterministic run, then suppresses duplicates", async () => {
    const now = new Date("2026-08-12T02:00:00.000Z");
    const jobId = getScheduledReportId("scheduled:monthly:2026-08");
    const row = {
      id: jobId,
      period: "2026-07",
      region_ids: ["region-1"],
      format: "pdf",
      status: "queued"
    };
    let insertCount = 0;
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO report_jobs")) {
          insertCount += 1;
          return { rows: insertCount === 1 ? [row] : [] };
        }
        return { rows: [row] };
      })
    };
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    const first = await enqueueScheduledReport("monthly", enabledConfig(), { db, queue, now: () => now });
    const second = await enqueueScheduledReport("monthly", enabledConfig(), { db, queue, now: () => now });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0]?.[1]).toMatchObject({ cadence: "monthly", period: "2026-07" });
  });

  it("queues email only for completed scheduled report jobs", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const generationQueue = {
      add: vi.fn(),
      getJob: vi.fn().mockResolvedValue({
        data: { jobId: "job-1", cadence: "weekly", runKey: "scheduled:weekly:2026-W32" }
      })
    };

    await expect(
      enqueueEmailForCompletedReport(
        { jobId: "bull-job-1" },
        { generationQueue, emailQueue: { add } }
      )
    ).resolves.toBe(true);
    expect(add).toHaveBeenCalledOnce();

    generationQueue.getJob.mockResolvedValueOnce({ data: { jobId: "manual-1" } });
    await expect(
      enqueueEmailForCompletedReport(
        { jobId: "manual-bull-job" },
        { generationQueue, emailQueue: { add } }
      )
    ).resolves.toBe(false);
    expect(add).toHaveBeenCalledOnce();
  });

  it("dispatches the report record through the injected email dispatcher", async () => {
    const report: ScheduledReportRecord = {
      jobId: "job-1",
      period: "2026-08",
      regionIds: ["region-1"],
      format: "pdf",
      status: "completed",
      downloadUrl: "https://storage.example.test/job-1.pdf"
    };
    const dispatcher = vi.fn().mockResolvedValue(true);

    await expect(processScheduledReportEmail(
      { jobId: report.jobId, runKey: "scheduled:weekly:2026-W32" },
      { db: { query: vi.fn().mockResolvedValue({ rows: [{ id: report.jobId, ...report }] }) }, dispatcher }
    )).resolves.toBeUndefined();
    expect(dispatcher).toHaveBeenCalledWith(expect.objectContaining({ jobId: report.jobId }));
  });
});

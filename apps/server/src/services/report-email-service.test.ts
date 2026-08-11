import { describe, expect, it, vi } from "vitest";

import { createReportEmailDispatcher } from "./report-email-service";

const config = {
  host: "smtp.example.test",
  port: 587,
  secure: false,
  from: "reports@example.test",
  recipients: ["executive@example.test"],
  subjectPrefix: "Petakeu Executive"
};

const report = {
  jobId: "job-1",
  period: "2026-08",
  regionIds: ["region-1"],
  format: "pdf" as const,
  status: "completed" as const,
  downloadUrl: "https://storage.example.test/job-1.pdf"
};

describe("scheduled report email dispatcher", () => {
  it("downloads the completed PDF and sends it as an attachment", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const dispatcher = createReportEmailDispatcher(config, {
      transport: { sendMail },
      fetcher: vi.fn().mockResolvedValue(Buffer.from("pdf")),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      skipSending: false
    });

    await expect(dispatcher(report)).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: config.from,
      to: "executive@example.test",
      subject: "Petakeu Executive - 2026-08",
      attachments: [expect.objectContaining({ filename: "petakeu-executive-summary-2026-08.pdf" })]
    }));
  });

  it("does not send in test mode and reports transport failures as false", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("SMTP unavailable"));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const skipped = createReportEmailDispatcher(config, {
      transport: { sendMail },
      skipSending: true,
      logger
    });
    const failed = createReportEmailDispatcher(config, {
      transport: { sendMail },
      fetcher: vi.fn().mockResolvedValue(Buffer.from("pdf")),
      logger,
      skipSending: false
    });

    await expect(skipped(report)).resolves.toBe(false);
    await expect(failed(report)).resolves.toBe(false);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditLogInspector } from "../AuditLogInspector";
import { useAuditLogs } from "../../../hooks/useAuditLogs";

vi.mock("../../../hooks/useAuditLogs", () => ({
  useAuditLogs: vi.fn()
}));

const mockedUseAuditLogs = vi.mocked(useAuditLogs);

describe("AuditLogInspector", () => {
  beforeEach(() => {
    mockedUseAuditLogs.mockReturnValue({
      data: {
        total: 1,
        data: [
          {
            id: "audit-1",
            timestamp: "2026-08-12T01:00:00.000Z",
            event: "report.requested",
            request_id: "request-1",
            user_id: "admin-1",
            action: "export",
            resource: "report",
            resource_id: "report-1",
            endpoint: "/api/reports/export",
            method: "POST",
            status_code: 201,
            ip_address: "127.0.0.1",
            user_agent: "vitest",
            details: { period: "2026-08", format: "pdf" }
          }
        ]
      },
      error: null,
      isError: false,
      isFetching: false,
      isPending: false,
      refetch: vi.fn()
    } as unknown as ReturnType<typeof useAuditLogs>);
  });

  it("renders audit records and applies exact-match filters", () => {
    render(<AuditLogInspector />);

    expect(screen.getByText("report.requested")).toBeInTheDocument();
    expect(screen.getByText("admin-1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Event"), { target: { value: "upload.created" } });
    fireEvent.click(screen.getByRole("button", { name: "Terapkan filter" }));

    expect(mockedUseAuditLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: "upload.created", limit: 25, offset: 0 })
    );
  });

  it("shows an accessible empty state", () => {
    mockedUseAuditLogs.mockReturnValue({
      data: { total: 0, data: [] },
      error: null,
      isError: false,
      isFetching: false,
      isPending: false,
      refetch: vi.fn()
    } as unknown as ReturnType<typeof useAuditLogs>);

    render(<AuditLogInspector />);

    expect(screen.getByRole("status")).toHaveTextContent("Tidak ada log yang cocok");
  });
});

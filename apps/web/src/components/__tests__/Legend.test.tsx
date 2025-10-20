import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Legend } from "../Legend";

describe("Legend", () => {
  it("renders formatted labels for quantile bins", () => {
    render(
      <Legend
        legend={{
          method: "quantile",
          bins: [1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000],
          labels: ["Kelas 1", "Kelas 2", "Kelas 3", "Kelas 4", "Kelas 5"],
          ranges: [
            { label: "Kelas 1", min: 0, max: 1_000_000 },
            { label: "Kelas 2", min: 1_000_000, max: 2_000_000 },
            { label: "Kelas 3", min: 2_000_000, max: 3_000_000 },
            { label: "Kelas 4", min: 3_000_000, max: 4_000_000 },
            { label: "Kelas 5", min: 4_000_000, max: 5_000_000 }
          ],
        }}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("Kelas 1 — ≤ Rp 1.000.000");
    expect(items[4]).toHaveTextContent("Kelas 5 — > Rp 4.000.000");
  });

  it("hides numeric ranges in public mode", () => {
    render(
      <Legend
        legend={{
          method: "quantile",
          bins: [1_000_000, 2_000_000],
          labels: ["Kelas 1", "Kelas 2"],
          ranges: [
            { label: "Kelas 1", min: 0, max: 1_000_000 },
            { label: "Kelas 2", min: 1_000_000, max: 2_000_000 }
          ],
        }}
        publicMode
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/^Kelas 1$/);
  });

  it("returns null without stops", () => {
    const { container } = render(<Legend legend={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});

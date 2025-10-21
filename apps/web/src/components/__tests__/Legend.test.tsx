import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Legend } from "../Legend";

describe("Legend", () => {
  it("renders formatted labels for quantile edges", () => {
    render(<Legend stops={[1000000, 2000000, 3000000, 4000000, 5000000]} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain("≤ Rp 1.000.000");
    expect(items[4].textContent).toContain("> Rp 4.000.000");
  });

  it("returns null without stops", () => {
    const { container } = render(<Legend stops={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

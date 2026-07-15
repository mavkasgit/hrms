import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { TableHeaderResetCell } from "./TableHeaderResetCell";

describe("TableHeaderResetCell", () => {
  it("renders ghost variant when no active filters", () => {
    const html = renderToStaticMarkup(
      <TableHeaderResetCell hasActiveFilters={false} onReset={() => {}} />,
    );

    expect(html).toContain('aria-label="Сбросить фильтры"');
    expect(html).toContain('title="Сбросить фильтры"');
  });

  it("renders filled state when filters are active", () => {
    const html = renderToStaticMarkup(
      <TableHeaderResetCell hasActiveFilters onReset={() => {}} />,
    );

    expect(html).toContain('aria-label="Сбросить фильтры"');
    expect(html).toContain("bg-black");
    expect(html).toContain("text-white");
  });

});
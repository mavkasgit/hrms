import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FiltersPanel, type FiltersPanelField } from "./FiltersPanel";

describe("FiltersPanel", () => {
  it("renders configured search and select fields without reset when props omitted", () => {
    const fields: FiltersPanelField[] = [
      { kind: "search", key: "search", value: "abc", onChange: () => {}, placeholder: "Поиск..." },
      {
        kind: "select",
        key: "status",
        value: "all",
        onChange: () => {},
        options: [
          { value: "all", label: "Все" },
          { value: "valid", label: "Валидные" },
        ],
      },
    ];

    const html = renderToStaticMarkup(<FiltersPanel fields={fields} />);

    expect(html).toContain('placeholder="Поиск..."');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain("Сбросить");
  });

  it("renders reset button when onReset and hasActiveFilters are provided", () => {
    const fields: FiltersPanelField[] = [
      { kind: "search", key: "search", value: "abc", onChange: () => {}, placeholder: "Поиск..." },
    ];

    const html = renderToStaticMarkup(
      <FiltersPanel fields={fields} onReset={() => {}} hasActiveFilters={false} />,
    );

    expect(html).toContain("Сбросить фильтры");
  });

  it("renders active filters summary block when provided", () => {
    const fields: FiltersPanelField[] = [
      { kind: "search", key: "search", value: "", onChange: () => {}, placeholder: "Поиск..." },
    ];

    const html = renderToStaticMarkup(
      <FiltersPanel
        fields={fields}
        onReset={() => {}}
        hasActiveFilters={true}
        activeSummary={{ count: 2, labels: ["Поиск", "Статус"] }}
      />,
    );

    expect(html).toContain("Активных фильтров: 2");
    expect(html).toContain("Поиск");
    expect(html).toContain("Статус");
    expect((html.match(/Сбросить фильтры/g) || []).length).toBe(1);
    expect(html).not.toContain(">Сбросить<");
  });

  it("renders actions slot content", () => {
    const fields: FiltersPanelField[] = [
      { kind: "search", key: "search", value: "", onChange: () => {}, placeholder: "Поиск..." },
    ];

    const html = renderToStaticMarkup(
      <FiltersPanel
        fields={fields}
        onReset={() => {}}
        hasActiveFilters={false}
        actions={<span>Action slot</span>}
      />,
    );

    expect(html).toContain("Action slot");
  });

  it("renders in compact mode with single flex row and shortened reset label", () => {
    const fields: FiltersPanelField[] = [
      { kind: "search", key: "search", value: "test", onChange: () => {}, placeholder: "Поиск..." },
    ];

    const html = renderToStaticMarkup(
      <FiltersPanel
        fields={fields}
        onReset={() => {}}
        hasActiveFilters={true}
        compact
        activeSummary={{ count: 1, labels: ["Поиск"] }}
      />,
    );

    expect(html).toContain("flex");
    expect(html).toContain("Сбросить");
    expect(html).not.toContain("Сбросить фильтры");
    expect(html).toContain("Активных фильтров: 1");
  });
});
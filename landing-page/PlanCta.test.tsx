import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanCta } from "./PlanCta";

describe("CTA de contratação", () => {
  it.each(["Standard", "Pro", "Enterprise"])("identifica %s sem simular compra", name => {
    const html = renderToStaticMarkup(<PlanCta name={name} destination="/#planos" />);
    expect(html).toContain(`Contratar ${name}`);
    expect(html).toContain("Contratação online em preparação.");
    expect(html).toContain("Nenhuma contratação ou cobrança foi realizada.");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("WhatsApp");
  });
  it("aceita o destino de contratação configurado pelo administrador", () => {
    const html = renderToStaticMarkup(<PlanCta name="Pro" destination="/checkout" />);
    expect(html).toContain('href="/checkout"');
    expect(html).toContain("Contratar Pro");
    expect(html).not.toContain("<details");
  });
});

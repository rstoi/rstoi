import { describe, it, expect } from "vitest";
import { CONNECTORS, connectorById, summarize } from "../src/connectors";

describe("registro de conectores", () => {
  it("soma total = ready + pending", () => {
    const s = summarize();
    expect(s.total).toBe(CONNECTORS.length);
    expect(s.ready + s.pending).toBe(s.total);
  });

  it("sistemas internos ficam pendentes (precisam de URL/credencial)", () => {
    expect(connectorById("projetos")?.status).toBe("pending");
    expect(connectorById("contratos")?.status).toBe("pending");
    expect(connectorById("comercial")?.status).toBe("pending");
  });

  it("conectores do repo/Workspace estão prontos", () => {
    expect(connectorById("whatsapp")?.status).toBe("ready");
    expect(connectorById("github")?.status).toBe("ready");
    expect(connectorById("drive")?.status).toBe("ready");
  });
});

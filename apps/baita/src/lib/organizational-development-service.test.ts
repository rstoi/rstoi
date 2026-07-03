import { describe, expect, it } from "vitest";
import {
  getAdizesProfile,
  MANAGEMENT_LEVELS,
  suggestNextManagementLevel,
} from "@/lib/organizational-development-service";

describe("suggestNextManagementLevel", () => {
  it("sugere o próximo nível sem pular etapas", () => {
    expect(suggestNextManagementLevel(0).level).toBe(1);
    expect(suggestNextManagementLevel(1).level).toBe(2);
  });

  it("não ultrapassa o nível máximo da escada", () => {
    expect(suggestNextManagementLevel(5).level).toBe(5);
  });

  it("todos os níveis têm sistemas gerenciais associados", () => {
    for (const level of MANAGEMENT_LEVELS) {
      expect(level.systems.length).toBeGreaterThan(0);
    }
  });
});

describe("getAdizesProfile", () => {
  it("retorna foco financeiro de caixa para Infância", () => {
    const profile = getAdizesProfile("INFANCY");
    expect(profile.financialFocus.join(" ")).toMatch(/caixa/i);
  });

  it("retorna foco em governança para Adolescência", () => {
    const profile = getAdizesProfile("ADOLESCENCE");
    expect(profile.financialFocus.join(" ")).toMatch(/governança/i);
  });
});

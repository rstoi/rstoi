import { describe, it, expect } from "vitest";
import { canSee, visibleModules, moduleById } from "../src/lib/modules";

describe("RBAC de módulos do console", () => {
  it("módulos não sensíveis são sempre visíveis", () => {
    expect(canSee(moduleById("painel")!, new Set())).toBe(true);
    expect(canSee(moduleById("whatsapp")!, new Set())).toBe(true);
  });

  it("Terminal e Claude CLI exigem papel de operador", () => {
    expect(canSee(moduleById("terminal")!, new Set())).toBe(false);
    expect(canSee(moduleById("claude")!, new Set())).toBe(false);
    expect(canSee(moduleById("terminal")!, new Set(["operador"]))).toBe(true);
    expect(canSee(moduleById("claude")!, new Set(["admin"]))).toBe(true);
  });

  it("visibleModules esconde abas sensíveis sem papel", () => {
    const ids = visibleModules(new Set()).map((m) => m.id);
    expect(ids).toContain("painel");
    expect(ids).not.toContain("terminal");
    expect(ids).not.toContain("claude");
    expect(ids).not.toContain("governanca");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { applyPolicy, requireOperator } from "../src/auth";

beforeEach(() => {
  process.env.ALLOWED_DOMAIN = "setup.com.br";
  process.env.OPERATOR_ROLES = "operador,admin";
});

describe("applyPolicy — restrição de domínio + RBAC", () => {
  it("aceita conta @setup.com.br verificada e resolve operador", () => {
    const p = applyPolicy({
      sub: "u1",
      email: "Renato@Setup.com.br",
      email_verified: true,
      roles: ["Operador"],
    });
    expect(p.email).toBe("renato@setup.com.br");
    expect(p.isOperator).toBe(true);
  });

  it("recusa domínio diferente de setup.com.br", () => {
    expect(() =>
      applyPolicy({ email: "x@gmail.com", email_verified: true }),
    ).toThrow(/restrito/);
  });

  it("recusa e-mail não verificado", () => {
    expect(() =>
      applyPolicy({ email: "x@setup.com.br", email_verified: false }),
    ).toThrow(/restrito/);
  });

  it("usuário sem papel de operador não abre shell", () => {
    const p = applyPolicy({
      email: "x@setup.com.br",
      email_verified: true,
      roles: ["leitor"],
    });
    expect(p.isOperator).toBe(false);
    expect(() => requireOperator(p)).toThrow(/sem permissão/);
  });
});

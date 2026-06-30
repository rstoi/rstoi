import { describe, it, expect } from "vitest";
import {
  parseXCommand, classifyReply, parseAutoPostMode, shouldAutoPost,
  isExpired, isDraftingCommand,
} from "../src/x-approval.js";

describe("x-approval — parseXCommand", () => {
  it("texto livre vira post", () => {
    expect(parseXCommand("lançamos o agente hoje 🚀"))
      .toEqual({ type: "post", idea: "lançamos o agente hoje 🚀" });
  });

  it("vazio vira post com ideia vazia", () => {
    expect(parseXCommand("  ")).toEqual({ type: "post", idea: "" });
  });

  it("thread força o tipo", () => {
    expect(parseXCommand("thread por que IA importa"))
      .toEqual({ type: "thread", idea: "por que IA importa" });
  });

  it("responder separa URL da ideia", () => {
    const c = parseXCommand("responder https://x.com/a/status/123 concordo demais");
    expect(c.type).toBe("reply");
    expect(c.targetUrl).toBe("https://x.com/a/status/123");
    expect(c.idea).toBe("concordo demais");
  });

  it("citar separa URL da ideia", () => {
    const c = parseXCommand("citar https://x.com/a/status/9 ótimo ponto");
    expect(c.type).toBe("quote");
    expect(c.targetUrl).toBe("https://x.com/a/status/9");
    expect(c.idea).toBe("ótimo ponto");
  });

  it("curtir e repostar pegam só a URL", () => {
    expect(parseXCommand("curtir https://x.com/a/status/1"))
      .toMatchObject({ type: "like", targetUrl: "https://x.com/a/status/1" });
    expect(parseXCommand("repostar https://x.com/a/status/2"))
      .toMatchObject({ type: "repost", targetUrl: "https://x.com/a/status/2" });
  });

  it("aliases: rt, resp, mencoes, ajuda", () => {
    expect(parseXCommand("rt https://x.com/a/status/3").type).toBe("repost");
    expect(parseXCommand("resp https://x.com/a/status/3 oi").type).toBe("reply");
    expect(parseXCommand("mencoes").type).toBe("mentions");
    expect(parseXCommand("ajuda").type).toBe("help");
  });
});

describe("x-approval — isDraftingCommand", () => {
  it("post/thread/reply/quote geram rascunho", () => {
    for (const t of ["post", "thread", "reply", "quote"] as const)
      expect(isDraftingCommand(t)).toBe(true);
  });
  it("like/repost/mentions/help não geram rascunho", () => {
    for (const t of ["like", "repost", "mentions", "help"] as const)
      expect(isDraftingCommand(t)).toBe(false);
  });
});

describe("x-approval — classifyReply", () => {
  it("palavras de publicação", () => {
    for (const w of ["ok", "OK", "publicar", "postar", "sim"])
      expect(classifyReply(w).action).toBe("publish");
  });
  it("palavras de cancelamento", () => {
    for (const w of ["cancelar", "não", "nao", "descartar"])
      expect(classifyReply(w).action).toBe("cancel");
  });
  it("editar captura o texto novo", () => {
    const r = classifyReply("editar deixa mais curto e direto");
    expect(r.action).toBe("edit");
    expect(r.editText).toBe("deixa mais curto e direto");
  });
  it("texto qualquer => none", () => {
    expect(classifyReply("hmm sei lá").action).toBe("none");
    expect(classifyReply("").action).toBe("none");
  });
});

describe("x-approval — parseAutoPostMode / shouldAutoPost", () => {
  it("off por padrão", () => {
    expect(parseAutoPostMode(undefined)).toBe("off");
    expect(parseAutoPostMode("off")).toBe("off");
    expect(parseAutoPostMode("")).toBe("off");
  });
  it("all publica tudo", () => {
    expect(parseAutoPostMode("all")).toBe("all");
    expect(shouldAutoPost("thread", parseAutoPostMode("all"))).toBe(true);
  });
  it("CSV de tipos", () => {
    const mode = parseAutoPostMode("tweet,reply");
    expect(shouldAutoPost("tweet", mode)).toBe(true);
    expect(shouldAutoPost("reply", mode)).toBe(true);
    expect(shouldAutoPost("thread", mode)).toBe(false);
    expect(shouldAutoPost("quote", mode)).toBe(false);
  });
  it("off nunca auto-posta", () => {
    expect(shouldAutoPost("tweet", "off")).toBe(false);
  });
  it("CSV inválido cai para off", () => {
    expect(parseAutoPostMode("xpto,foo")).toBe("off");
  });
});

describe("x-approval — isExpired", () => {
  it("compara com expiresAt", () => {
    expect(isExpired({ expiresAt: 1000 }, 999)).toBe(false);
    expect(isExpired({ expiresAt: 1000 }, 1000)).toBe(true);
    expect(isExpired({ expiresAt: 1000 }, 1001)).toBe(true);
  });
});

import { Router } from "express";
import { verifyGoogleCredential, issueSessionCookie, clearSessionCookie } from "../auth.js";

export const authRouter = Router();

// O botão "Sign in with Google" (Google Identity Services) faz um POST
// x-www-form-urlencoded direto para cá com o campo `credential` (ID token JWT).
authRouter.post("/auth/google", async (req, res) => {
  const credential = req.body?.credential as string | undefined;
  if (!credential) {
    res.status(400).redirect("/login?error=missing_credential");
    return;
  }
  try {
    const user = await verifyGoogleCredential(credential);
    issueSessionCookie(res, user);
    res.redirect("/");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha no login.";
    res.redirect(`/login?error=${encodeURIComponent(message)}`);
  }
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.redirect("/login");
});

authRouter.get("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.redirect("/login");
});

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export type LoginFormState = { error?: string };

export async function loginAction(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return { error: "Credenciais inválidas." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Credenciais inválidas." };
  }

  await createSession(user.id);
  await recordAudit({
    actorUserId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    rationale: "Login bem-sucedido.",
  });

  redirect("/empresas");
}

export async function logoutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

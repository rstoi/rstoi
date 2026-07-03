"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "@/app/(auth)/actions";

const initialState: LoginFormState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-baita-blue">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="baita-gradient mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold text-white">
            B
          </span>
          <h1 className="text-xl font-semibold text-white">Baita Financial Intelligence OS</h1>
          <p className="mt-1 text-sm text-white/60">Diagnóstico financeiro contínuo e governança</p>
        </div>
        <form action={formAction} className="baita-card space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium">E-mail</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-baita-purple"
              placeholder="voce@empresa.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Senha</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-baita-purple"
              placeholder="••••••••"
            />
          </div>
          {state.error && <p className="text-sm text-status-critical">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-baita-purple px-3.5 py-2 text-sm font-medium text-white hover:bg-baita-purple-dark disabled:opacity-50"
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

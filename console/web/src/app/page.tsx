"use client";
// Porta de entrada: login Google (restrito a setup.com.br) ou console.
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  ALLOWED_DOMAIN,
  firebaseEnabled,
  signInWithGoogle,
  watchUser,
} from "@/lib/firebase";
import Console from "@/components/Console";

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [demo, setDemo] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const unsub = watchUser((u) => {
      setUser(u);
      setReady(true);
    });
    if (!firebaseEnabled) setReady(true);
    return unsub;
  }, []);

  if (!ready) return null;

  if (user || demo) return <Console user={user} />;

  async function login() {
    setErr("");
    try {
      await signInWithGoogle();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="login">
      <div className="card">
        <div className="badge">setupOS Cloud</div>
        <h1>Console único</h1>
        <p>Acesso restrito a contas @{ALLOWED_DOMAIN}</p>

        {firebaseEnabled ? (
          <button className="gbtn" onClick={login}>
            Entrar com Google
          </button>
        ) : (
          <button className="gbtn" onClick={() => setDemo(true)}>
            Abrir em modo demonstração
          </button>
        )}

        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}

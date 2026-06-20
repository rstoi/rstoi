// Inicialização do Firebase + login Google restrito ao domínio setup.com.br.
//
// IMPORTANTE: o parâmetro `hd` abaixo é apenas conveniência de UI (filtra a tela
// de seleção de conta). A restrição REAL de domínio é imposta no gateway
// (Cloud Run), que rejeita qualquer ID token cujo e-mail não termine em
// @setup.com.br ou não esteja verificado. Nunca confie só no cliente.
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";

export const ALLOWED_DOMAIN =
  process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? "setup.com.br";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Sem credenciais => modo demonstração (login desabilitado).
export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

if (firebaseEnabled) {
  app = getApps().length ? getApps()[0] : initializeApp(config);
  auth = getAuth(app);
}

export function watchUser(cb: (user: User | null) => void): () => void {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error("Firebase não configurado (modo demonstração).");
  const provider = new GoogleAuthProvider();
  // Conveniência: já filtra contas do domínio corporativo.
  provider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: "select_account" });

  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;

  // Defesa em profundidade no cliente (a verificação que importa é no backend).
  const domain = (user.email ?? "").split("@")[1]?.toLowerCase();
  if (!user.emailVerified || domain !== ALLOWED_DOMAIN) {
    await fbSignOut(auth);
    throw new Error(`Acesso restrito a contas @${ALLOWED_DOMAIN}.`);
  }
  return user;
}

export async function signOut(): Promise<void> {
  if (auth) await fbSignOut(auth);
}

export async function getIdToken(): Promise<string | null> {
  return auth?.currentUser ? auth.currentUser.getIdToken() : null;
}

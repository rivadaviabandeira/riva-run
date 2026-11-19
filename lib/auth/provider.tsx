import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "../supabase";

/**
 * Estados possíveis da sessão:
 * - loading: verificando se já existe sessão salva
 * - unconfigured: sem EXPO_PUBLIC_SUPABASE_*, só o modo demonstração funciona
 * - signedOut: Supabase configurado, nenhum usuário logado
 * - signedIn: sessão válida do Supabase Auth
 * - demo: dados locais, sem conta (atalho explícito da tela de login)
 */
export type AuthStatus = "loading" | "unconfigured" | "signedOut" | "signedIn" | "demo";

export type AuthResult = { ok: boolean; message: string };

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  enterDemo: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Mensagens do Supabase Auth em inglês -> texto para o corredor. */
export function authErrorMessage(message: string, fallback: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (normalized.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (normalized.includes("user already registered")) return "Este e-mail já tem conta. Tente entrar.";
  if (normalized.includes("password should be at least"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (normalized.includes("unable to validate email") || normalized.includes("invalid email"))
    return "Informe um e-mail válido.";
  if (normalized.includes("rate limit") || normalized.includes("too many"))
    return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  if (normalized.includes("network") || normalized.includes("fetch"))
    return "Não foi possível falar com o servidor. Verifique a conexão.";
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [status, setStatus] = useState<AuthStatus>(configured ? "loading" : "unconfigured");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!configured) return;

    let active = true;
    const supabase = getSupabaseClient();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setStatus((current) => (current === "demo" ? current : data.session ? "signedIn" : "signedOut"));
      })
      .catch(() => {
        if (active) setStatus((current) => (current === "demo" ? current : "signedOut"));
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setStatus((current) => {
        if (current === "demo") return current;
        return nextSession ? "signedIn" : "signedOut";
      });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [configured]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!configured) {
        return { ok: false, message: "Supabase não configurado neste ambiente." };
      }
      const { data, error } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { ok: false, message: authErrorMessage(error.message, "Não foi possível entrar.") };
      if (!data.session) return { ok: false, message: "Confirme seu e-mail antes de entrar." };
      setSession(data.session);
      setStatus("signedIn");
      return { ok: true, message: "Sessão iniciada." };
    },
    [configured],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResult> => {
      if (!configured) {
        return { ok: false, message: "Supabase não configurado neste ambiente." };
      }
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: email.trim(),
        password,
        // O trigger handle_new_user grava este valor em profiles.display_name.
        options: { data: { display_name: name.trim() } },
      });
      if (error) return { ok: false, message: authErrorMessage(error.message, "Não foi possível criar a conta.") };
      if (!data.session) {
        return { ok: true, message: "Conta criada. Confirme o e-mail para entrar." };
      }
      setSession(data.session);
      setStatus("signedIn");
      return { ok: true, message: "Conta criada." };
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    if (configured) {
      try {
        await getSupabaseClient().auth.signOut();
      } catch {
        // Sem rede o usuário local sai de qualquer forma.
      }
    }
    setSession(null);
    setStatus(configured ? "signedOut" : "unconfigured");
  }, [configured]);

  const enterDemo = useCallback(() => {
    setSession(null);
    setStatus("demo");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      configured,
      signIn,
      signUp,
      signOut,
      enterDemo,
    }),
    [status, session, configured, signIn, signUp, signOut, enterDemo],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de AuthProvider.");
  return context;
}

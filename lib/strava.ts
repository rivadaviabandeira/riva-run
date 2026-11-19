/**
 * Conexão do Strava pelo app.
 *
 * O app nunca vê client_secret nem tokens: ele pede à Edge Function
 * `strava-auth` uma `authorization_url` de uso único (com o `state` gravado no
 * servidor) e abre essa URL no navegador. Quem troca o `code` por token e grava
 * a conexão é a função, no servidor.
 *
 * Retorno:
 * - web: a própria aba volta para a URL do app com `?strava=connected`.
 * - nativo: o deep link devolvido por `WebBrowser.openAuthSessionAsync`.
 *
 * O texto de retorno é guardado em memória até a tela de Perfil consumir, porque
 * o app pode reabrir na rota inicial antes de o usuário chegar ao Perfil.
 */
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getSupabaseClient } from "./supabase";

export type StravaResult = { ok: boolean; message: string };

const NETWORK_MESSAGE =
  "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";
const START_MESSAGE = "Não foi possível iniciar a conexão com o Strava. Tente de novo.";

let pendingReturn: StravaResult | null = null;

/** Traduz o parâmetro devolvido pelo callback da função para uma mensagem do app. */
function parseReturnUrl(url: string | null | undefined): StravaResult | null {
  if (!url) return null;
  const queryIndex = url.indexOf("?");
  if (queryIndex < 0) return null;

  const params = new URLSearchParams(url.slice(queryIndex + 1).split("#")[0]);
  const status = params.get("strava");
  if (!status) return null;

  if (status === "connected") {
    return {
      ok: true,
      message: "Strava conectado. As próximas corridas entram pela sincronização do servidor.",
    };
  }

  return {
    ok: false,
    message: "A autorização do Strava não foi concluída ou foi cancelada. Tente conectar de novo.",
  };
}

/**
 * Lê o retorno do OAuth no web e apaga o parâmetro da URL, para um recarregamento
 * não repetir a mensagem.
 */
export function captureWebStravaReturn(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;

  const result = parseReturnUrl(window.location.href);
  if (!result) return;

  pendingReturn = result;

  const url = new URL(window.location.href);
  url.searchParams.delete("strava");
  window.history.replaceState({}, "", url.toString());
}

/** Devolve o retorno do OAuth uma única vez (ou null se não houve). */
export function consumeStravaReturn(): StravaResult | null {
  const result = pendingReturn;
  pendingReturn = null;
  return result;
}

/** Mensagem de erro da função, quando o corpo é JSON; senão um texto genérico. */
async function invokeErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === "function") {
    try {
      const body = (await context.json()) as { error?: string } | null;
      if (body?.error) return body.error;
    } catch {
      // Corpo não era JSON: cai no texto genérico.
    }
  }
  return START_MESSAGE;
}

/**
 * Abre o Strava para autorizar a conta. No nativo aguarda o deep link de volta
 * e já devolve o resultado final; no web a página é substituída, então o
 * resultado chega depois, por `captureWebStravaReturn`.
 */
export async function startStravaConnect(): Promise<StravaResult> {
  const supabase = getSupabaseClient();

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { ok: false, message: "Entre na sua conta para conectar o Strava." };
  }

  let authorizationUrl: string | undefined;
  try {
    const { data, error } = await supabase.functions.invoke("strava-auth", { method: "GET" });
    if (error) return { ok: false, message: await invokeErrorMessage(error) };
    authorizationUrl = (data as { authorization_url?: string } | null)?.authorization_url;
  } catch {
    return { ok: false, message: NETWORK_MESSAGE };
  }

  if (!authorizationUrl) return { ok: false, message: START_MESSAGE };

  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.location.assign(authorizationUrl);
    return { ok: true, message: "Abrindo o Strava para autorizar…" };
  }

  try {
    // O redirect precisa estar cadastrado em APP_REDIRECT_URI no secret da função.
    const redirectUrl = Linking.createURL("strava");
    const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, redirectUrl);
    if (result.type !== "success") {
      return { ok: false, message: "Autorização do Strava cancelada." };
    }
    return (
      parseReturnUrl(result.url) ?? {
        ok: false,
        message: "O Strava respondeu sem o resultado da conexão. Tente de novo.",
      }
    );
  } catch {
    return { ok: false, message: START_MESSAGE };
  }
}

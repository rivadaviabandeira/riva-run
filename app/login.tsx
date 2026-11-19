import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton, Card, Kicker, Muted, Screen, palette } from "../components/ui";
import { useAuth } from "../lib/auth/provider";

export default function LoginScreen() {
  const { signIn, signUp, resendConfirmation, enterDemo, configured } = useAuth();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  // Conta criada (ou login barrado) esperando a confirmação de e-mail.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const resend = async () => {
    if (resending || !pendingEmail) return;
    setResending(true);
    setResendFeedback(null);
    try {
      setResendFeedback(await resendConfirmation(pendingEmail));
    } catch {
      setResendFeedback({ ok: false, message: "Não foi possível reenviar agora. Tente de novo." });
    } finally {
      setResending(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    setFeedback(null);

    if (!email.includes("@") || email.trim().length < 5) {
      setFeedback({ ok: false, message: "Informe um e-mail válido." });
      return;
    }
    if (password.length < 6) {
      setFeedback({ ok: false, message: "A senha precisa ter pelo menos 6 caracteres." });
      return;
    }
    if (creating && name.trim().length < 2) {
      setFeedback({ ok: false, message: "Informe seu nome para o perfil." });
      return;
    }

    setBusy(true);
    try {
      const result = creating ? await signUp(name, email, password) : await signIn(email, password);
      if (result.needsEmailConfirmation) {
        setPendingEmail(email.trim());
        setResendFeedback(null);
        setFeedback(null);
        return;
      }
      setPendingEmail(null);
      setFeedback(result);
    } catch {
      setFeedback({ ok: false, message: "Falha inesperada ao falar com o servidor. Tente de novo." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Kicker>CORRA NO SEU RITMO</Kicker>
      <Text style={styles.title}>
        Pace<Text style={{ color: palette.green }}>Hub</Text>
      </Text>
      <Muted>
        {creating
          ? "Crie sua conta para juntar suas corridas, desafios e pontos."
          : "Entre para ver suas corridas, desafios e o plano do treinador."}
      </Muted>

      {!configured ? (
        <Card style={styles.setup}>
          <View style={styles.row}>
            <Ionicons name="construct-outline" size={18} color={palette.gold} />
            <Text style={styles.setupTitle}>Supabase não configurado</Text>
          </View>
          <Muted>
            Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local e
            reinicie o app para entrar com uma conta de verdade. Enquanto isso, a demonstração usa
            dados locais.
          </Muted>
          <ActionButton
            label="Abrir demonstração"
            icon="eye-outline"
            variant="ghost"
            onPress={enterDemo}
          />
        </Card>
      ) : null}

      <Card style={styles.form}>
        {creating ? (
          <>
            <Text style={styles.label}>NOME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Como você quer aparecer no ranking"
              placeholderTextColor={palette.faint}
              autoCapitalize="words"
              autoComplete="name"
              editable={!busy}
              style={styles.input}
            />
          </>
        ) : null}

        <Text style={styles.label}>E-MAIL</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
          placeholderTextColor={palette.faint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          editable={!busy}
          style={styles.input}
        />

        <Text style={styles.label}>SENHA</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="mínimo de 6 caracteres"
          placeholderTextColor={palette.faint}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={creating ? "new-password" : "current-password"}
          editable={!busy}
          onSubmitEditing={submit}
          style={styles.input}
        />

        {feedback ? (
          <View style={styles.feedback}>
            <Ionicons
              name={feedback.ok ? "checkmark-circle-outline" : "alert-circle-outline"}
              size={15}
              color={feedback.ok ? palette.green : "#FF9C93"}
            />
            <Text style={[styles.feedbackText, { color: feedback.ok ? palette.green : "#FF9C93" }]}>
              {feedback.message}
            </Text>
          </View>
        ) : null}

        <ActionButton
          label={busy ? "Aguarde…" : creating ? "Criar conta" : "Entrar"}
          icon={creating ? "person-add-outline" : "log-in-outline"}
          onPress={submit}
          disabled={busy || !configured}
        />

        <Text
          style={styles.switchMode}
          onPress={() => {
            setCreating((current) => !current);
            setFeedback(null);
            setPendingEmail(null);
            setResendFeedback(null);
          }}
        >
          {creating ? "Já tenho conta · ENTRAR" : "Não tenho conta · CRIAR"}
        </Text>
      </Card>

      {pendingEmail ? (
        <Card style={styles.setup}>
          <View style={styles.row}>
            <Ionicons name="mail-unread-outline" size={18} color={palette.gold} />
            <Text style={styles.setupTitle}>Confirme seu e-mail para entrar</Text>
          </View>
          <Muted>
            Enviamos um link para {pendingEmail}. Abra o link e volte aqui para entrar. Se não
            chegar em alguns minutos, confira o spam ou reenvie.
          </Muted>
          {resendFeedback ? (
            <View style={styles.feedback}>
              <Ionicons
                name={resendFeedback.ok ? "checkmark-circle-outline" : "alert-circle-outline"}
                size={15}
                color={resendFeedback.ok ? palette.green : "#FF9C93"}
              />
              <Text
                style={[
                  styles.feedbackText,
                  { color: resendFeedback.ok ? palette.green : "#FF9C93" },
                ]}
              >
                {resendFeedback.message}
              </Text>
            </View>
          ) : null}
          <ActionButton
            label={resending ? "Reenviando…" : "Reenviar e-mail de confirmação"}
            icon="send-outline"
            variant="ghost"
            onPress={resend}
            disabled={resending}
          />
        </Card>
      ) : null}

      <Muted>
        Sua sessão fica salva no aparelho. O app nunca recebe a chave service_role nem os tokens do
        Strava — isso fica só no servidor.
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.text, fontSize: 34, fontWeight: "900", marginTop: -2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  setup: { backgroundColor: "#241F14", borderColor: `${palette.gold}55`, gap: 8 },
  setupTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
  form: { gap: 8 },
  label: { color: palette.faint, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginTop: 2 },
  input: {
    backgroundColor: "#0E161A",
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: palette.text,
    fontSize: 14,
    fontWeight: "800",
  },
  feedback: { flexDirection: "row", alignItems: "center", gap: 7 },
  feedbackText: { fontSize: 10, fontWeight: "800", flex: 1, lineHeight: 15 },
  switchMode: {
    color: palette.green,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "center",
    marginTop: 4,
  },
});

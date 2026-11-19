import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActionButton, Card, palette } from "../components/ui";
import { AuthProvider, useAuth } from "../lib/auth/provider";
import { DataProvider, useData } from "../lib/data/provider";

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={palette.green} />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

function LoadError() {
  const { dataError, reloadData } = useData();
  const { signOut } = useAuth();

  return (
    <View style={styles.centered}>
      <Card style={styles.errorCard}>
        <Text style={styles.errorTitle}>Não deu para carregar seus dados</Text>
        <Text style={styles.errorText}>{dataError}</Text>
        <ActionButton label="Tentar de novo" icon="refresh-outline" onPress={reloadData} />
        <ActionButton label="Sair da conta" variant="ghost" onPress={signOut} />
      </Card>
    </View>
  );
}

function Navigator() {
  const { status } = useAuth();
  const { ready, dataError } = useData();

  const signedIn = status === "signedIn" || status === "demo";
  const checkingSession = status === "loading";

  // O Stack existe desde o primeiro render: as rotas privadas e a de login são
  // escolhidas pelo guard do expo-router, sem navegação manual antes do mount.
  const overlay = checkingSession ? (
    <Loading label="Verificando sua sessão…" />
  ) : signedIn && dataError ? (
    <LoadError />
  ) : signedIn && !ready ? (
    <Loading label="Carregando seus dados…" />
  ) : null;

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B1014" } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="perfil" />
          <Stack.Screen name="conquistas" />
          <Stack.Screen name="montar-treino" />
          <Stack.Screen name="tenis" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      {overlay ? <View style={styles.overlay}>{overlay}</View> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <DataProvider>
        <StatusBar style="light" />
        <Navigator />
      </DataProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.screen },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.screen },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: palette.screen,
  },
  loadingLabel: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  errorCard: { gap: 10, width: "100%" },
  errorTitle: { color: palette.text, fontSize: 15, fontWeight: "900" },
  errorText: { color: palette.muted, fontSize: 11, lineHeight: 16 },
});

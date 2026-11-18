import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { DataProvider } from "../lib/data/provider";

export default function RootLayout() {
  return (
    <DataProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B1014" } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="perfil" />
        <Stack.Screen name="conquistas" />
        <Stack.Screen name="montar-treino" />
        <Stack.Screen name="tenis" />
      </Stack>
    </DataProvider>
  );
}

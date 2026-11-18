import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActionButton,
  Card,
  Kicker,
  Muted,
  ProgressBar,
  Screen,
  SectionTitle,
  palette,
} from "../components/ui";
import { useData } from "../lib/data/provider";
import { MAX_ACTIVE_SHOES, SHOE_REPLACE_KM, formatDecimal, formatShortDate } from "../lib/domain";

export default function ShoesScreen() {
  const { shoes, stats, activities, actions } = useData();
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");

  const unassigned = activities.filter(
    (activity) => activity.status === "validated" && !activity.shoeId,
  );
  const remaining = MAX_ACTIVE_SHOES - shoes.length;

  const submit = () => {
    const result = actions.addShoe(brand, model);
    if (result.ok) {
      setBrand("");
      setModel("");
    }
    Alert.alert(result.ok ? "Tênis cadastrado" : "Não foi possível cadastrar", result.message);
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Ionicons name="chevron-back" size={20} color={palette.text} onPress={() => router.back()} />
        <Text style={styles.topTitle}>Tênis</Text>
        <View style={{ width: 20 }} />
      </View>

      <Kicker>CUIDE DO SEU EQUIPAMENTO</Kicker>
      <Text style={styles.title}>Meus tênis</Text>
      <Muted>Acompanhe a quilometragem de até cinco pares ativos.</Muted>

      <Card style={styles.counter}>
        <View>
          <Text style={styles.label}>PARES ATIVOS</Text>
          <Text style={styles.count}>
            {String(shoes.length).padStart(2, "0")} <Text style={styles.countMax}>/ 0{MAX_ACTIVE_SHOES}</Text>
          </Text>
        </View>
        <Ionicons name="footsteps-outline" size={30} color={palette.green} />
      </Card>

      {shoes.map((shoe) => {
        const km = stats.shoeKmById[shoe.id] ?? 0;
        const wear = Math.min(1, km / SHOE_REPLACE_KM);
        return (
          <Card key={shoe.id}>
            <View style={styles.shoeRow}>
              <View style={styles.shoeIcon}>
                <Ionicons name="footsteps" size={28} color={palette.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.brand}>{shoe.brand}</Text>
                <Text style={styles.model}>{shoe.model}</Text>
                <Muted>desde {formatShortDate(shoe.addedAt)}</Muted>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.km}>{formatDecimal(km)}</Text>
                <Text style={styles.label}>KM</Text>
              </View>
            </View>
            <ProgressBar value={wear} color={wear > 0.85 ? "#FF9C93" : palette.green} />
            <Muted>
              {wear >= 0.85
                ? "Perto do limite sugerido de troca (800 km)."
                : `Vida útil estimada: ${formatDecimal(SHOE_REPLACE_KM - km)} km restantes.`}
            </Muted>
          </Card>
        );
      })}

      <SectionTitle>Corridas sem tênis associado</SectionTitle>
      {unassigned.length === 0 ? (
        <Card>
          <Muted>Todas as corridas validadas já têm um par associado.</Muted>
        </Card>
      ) : (
        unassigned.map((activity) => (
          <Card key={activity.id}>
            <View style={styles.runRow}>
              <Ionicons name="walk-outline" size={18} color={palette.blue} />
              <View style={{ flex: 1 }}>
                <Text style={styles.model}>{activity.title}</Text>
                <Muted>
                  {formatShortDate(activity.startedAt)} · {formatDecimal(activity.distanceKm)} km
                </Muted>
              </View>
            </View>
            <View style={styles.chips}>
              {shoes.map((shoe) => (
                <Text
                  key={shoe.id}
                  onPress={() => {
                    const result = actions.associateShoe(activity.id, shoe.id);
                    Alert.alert(result.ok ? "Associação salva" : "Erro", result.message);
                  }}
                  style={styles.chip}
                >
                  {shoe.brand} {shoe.model}
                </Text>
              ))}
            </View>
          </Card>
        ))
      )}

      <SectionTitle>Adicionar par</SectionTitle>
      <Card>
        <TextInput
          value={brand}
          onChangeText={setBrand}
          placeholder="Marca (ex.: ASICS)"
          placeholderTextColor={palette.faint}
          autoCapitalize="characters"
          style={styles.input}
        />
        <TextInput
          value={model}
          onChangeText={setModel}
          placeholder="Modelo (ex.: Novablast 4)"
          placeholderTextColor={palette.faint}
          style={styles.input}
        />
        <ActionButton
          label={remaining > 0 ? `Cadastrar tênis (${remaining} vaga(s))` : "Limite de 5 pares atingido"}
          icon="add-circle-outline"
          onPress={submit}
          disabled={remaining <= 0}
        />
        <Muted>O limite é validado também no banco de dados para impedir burlas.</Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topTitle: { color: palette.text, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  title: { color: palette.text, fontSize: 30, fontWeight: "900", marginTop: -6 },
  counter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: palette.cardAlt, borderColor: palette.lineStrong },
  label: { color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  count: { color: palette.text, fontSize: 30, fontWeight: "900", marginTop: 4 },
  countMax: { color: palette.muted, fontSize: 15 },
  shoeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  shoeIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: "#1E2A1B", alignItems: "center", justifyContent: "center" },
  brand: { color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  model: { color: palette.text, fontSize: 14, fontWeight: "900" },
  km: { color: palette.text, fontSize: 20, fontWeight: "900" },
  runRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    color: palette.green,
    fontSize: 10,
    fontWeight: "800",
    borderWidth: 1,
    borderColor: "#3A4A33",
    backgroundColor: "#1E2A1B",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    overflow: "hidden",
  },
  input: {
    backgroundColor: "#0F171C",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 12,
    color: palette.text,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 12,
  },
});

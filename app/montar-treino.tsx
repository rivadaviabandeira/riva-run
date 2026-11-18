import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton, Card, Kicker, Muted, Screen, palette } from "../components/ui";
import { useData } from "../lib/data/provider";
import {
  SESSION_TYPES,
  WEEKDAYS,
  addDays,
  formatDecimal,
  formatPace,
  goalLabel,
  levelRules,
  parsePaceInput,
  planWeek,
  startOfWeek,
  targetPaceS,
  type SessionTypeId,
} from "../lib/domain";
import type { IconName } from "../lib/data/types";

export default function BuildSessionScreen() {
  const params = useLocalSearchParams<{ athleteId?: string }>();
  const { athletes, actions } = useData();

  const [athleteId, setAthleteId] = useState(
    () => params.athleteId ?? athletes[0]?.id ?? "",
  );
  const athlete = athletes.find((item) => item.id === athleteId) ?? athletes[0];

  const [typeId, setTypeId] = useState<SessionTypeId>("leve");
  const [weekday, setWeekday] = useState(() => {
    const today = new Date();
    return (today.getDay() + 6) % 7;
  });
  const [distanceText, setDistanceText] = useState("6,0");
  const [paceText, setPaceText] = useState(() =>
    formatPace(targetPaceS(athlete?.basePaceS ?? 330, "leve")),
  );
  const [noteText, setNoteText] = useState("");

  const suggestion = useMemo(() => {
    if (!athlete) return null;
    return (
      planWeek({
        goal: athlete.goal,
        level: athlete.level,
        basePaceS: athlete.basePaceS,
        weeklyKm: athlete.weeklyKm,
        daysPerWeek: athlete.daysPerWeek,
      }).find((draft) => draft.typeId === typeId) ?? null
    );
  }, [athlete, typeId]);

  const pickType = (next: SessionTypeId) => {
    setTypeId(next);
    // O pace alvo acompanha o tipo de sessão; o treinador pode ajustar depois.
    if (athlete) setPaceText(formatPace(targetPaceS(athlete.basePaceS, next)));
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    setDistanceText(formatDecimal(suggestion.distanceKm));
    setPaceText(formatPace(suggestion.targetPaceS));
    setWeekday(suggestion.weekday);
    setNoteText(suggestion.note);
  };

  const save = () => {
    if (!athlete) {
      Alert.alert("Atleta não encontrado", "Volte e escolha o corredor do treino.");
      return;
    }
    const pace = parsePaceInput(paceText);
    if (pace === null) {
      Alert.alert("Pace inválido", "Use o formato mm:ss entre 2:30 e 12:00 por km.");
      return;
    }
    const distanceKm = Number(distanceText.replace(",", "."));
    if (!Number.isFinite(distanceKm)) {
      Alert.alert("Distância inválida", "Informe a distância em quilômetros, por exemplo 8,5.");
      return;
    }

    const date = addDays(startOfWeek(new Date()), weekday);
    date.setHours(6, 30, 0, 0);

    const result = actions.addTrainingSession({
      athleteId: athlete.id,
      date: date.toISOString(),
      typeId,
      distanceKm,
      targetPaceS: pace,
      note: noteText,
    });

    Alert.alert(result.ok ? "Treino prescrito" : "Não foi possível salvar", result.message, [
      { text: "OK", onPress: () => result.ok && router.back() },
    ]);
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Ionicons name="chevron-back" size={20} color={palette.text} onPress={() => router.back()} />
        <Text style={styles.topTitle}>Montar treino</Text>
        <View style={{ width: 20 }} />
      </View>

      <Kicker>PRESCRIÇÃO INDIVIDUAL</Kicker>
      <Text style={styles.title}>
        Treino<Text style={{ color: palette.green }}> do atleta</Text>
      </Text>
      <Muted>
        Escolha o atleta, o tipo de sessão e ajuste distância e pace. A revisão da semana avisa se a
        carga passar do limite.
      </Muted>

      <Text style={styles.label}>ATLETA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {athletes.map((item) => {
          const active = item.id === athlete?.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setAthleteId(item.id);
                setPaceText(formatPace(targetPaceS(item.basePaceS, typeId)));
              }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {item.name.split(" ")[0]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {athlete ? (
        <Muted>
          Meta {goalLabel(athlete.goal)} · {levelRules(athlete.level).label} · pace base{" "}
          {formatPace(athlete.basePaceS)}/km · {formatDecimal(athlete.weeklyKm)} km/semana
        </Muted>
      ) : null}

      <Text style={styles.label}>TIPO DE SESSÃO</Text>
      <View style={styles.grid}>
        {SESSION_TYPES.map((type) => {
          const active = type.id === typeId;
          return (
            <Pressable
              key={type.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => pickType(type.id)}
              style={[styles.typeCard, active && { borderColor: type.color, backgroundColor: `${type.color}18` }]}
            >
              <Ionicons name={type.icon as IconName} size={16} color={type.color} />
              <Text style={styles.typeText}>{type.label}</Text>
              <Text style={styles.typeMeta}>
                {formatPace(targetPaceS(athlete?.basePaceS ?? 330, type.id))}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>DIA DA SEMANA</Text>
      <View style={styles.chips}>
        {WEEKDAYS.map((label, index) => {
          const active = index === weekday;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setWeekday(index)}
              style={[styles.dayChip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <Text style={styles.label}>DISTÂNCIA (KM)</Text>
        <TextInput
          value={distanceText}
          onChangeText={setDistanceText}
          keyboardType="decimal-pad"
          placeholder="8,0"
          placeholderTextColor={palette.faint}
          style={styles.input}
        />
        <Text style={styles.label}>PACE ALVO (MM:SS POR KM)</Text>
        <TextInput
          value={paceText}
          onChangeText={setPaceText}
          keyboardType="numbers-and-punctuation"
          placeholder="05:30"
          placeholderTextColor={palette.faint}
          style={styles.input}
        />
        <Text style={styles.label}>OBSERVAÇÃO PARA O ATLETA</Text>
        <TextInput
          value={noteText}
          onChangeText={setNoteText}
          placeholder="Ex.: manter cadência alta nos tiros"
          placeholderTextColor={palette.faint}
          multiline
          style={[styles.input, styles.inputMultiline]}
        />
      </Card>

      <Card style={styles.preview}>
        <View style={styles.previewRow}>
          <Ionicons name="calendar-outline" size={15} color={palette.green} />
          <Text style={styles.previewText}>
            {WEEKDAYS[weekday]} · {distanceText || "0"} km · pace {paceText || "--:--"}/km
          </Text>
        </View>
        {suggestion ? (
          <ActionButton
            label={`Sugestão do treinador: ${formatDecimal(suggestion.distanceKm)} km`}
            icon="bulb-outline"
            variant="ghost"
            onPress={applySuggestion}
          />
        ) : (
          <Muted>
            O plano semanal deste atleta não usa este tipo de sessão. Ajuste a distância e o pace
            conforme a resposta do corredor.
          </Muted>
        )}
      </Card>

      <ActionButton label="Prescrever treino" icon="checkmark-circle-outline" onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topTitle: { color: palette.text, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  title: { color: palette.text, fontSize: 27, fontWeight: "900", marginTop: -4 },
  label: { color: palette.faint, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginTop: 2 },
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap", paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
  },
  chipActive: { backgroundColor: palette.green, borderColor: palette.green },
  chipText: { color: palette.text, fontSize: 11, fontWeight: "900" },
  chipTextActive: { color: "#10170A" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeCard: {
    width: "47.5%",
    gap: 4,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
  },
  typeText: { color: palette.text, fontSize: 11, fontWeight: "900" },
  typeMeta: { color: palette.muted, fontSize: 9, fontWeight: "800" },
  dayChip: {
    minWidth: 40,
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
  },
  input: {
    backgroundColor: "#0E161A",
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.text,
    fontSize: 14,
    fontWeight: "800",
  },
  inputMultiline: { minHeight: 66, textAlignVertical: "top", fontSize: 12, fontWeight: "600" },
  preview: { backgroundColor: "#17221F", borderColor: "#2A3B33" },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewText: { color: palette.text, fontSize: 12, fontWeight: "900" },
});

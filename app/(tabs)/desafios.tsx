import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton, Card, Kicker, Muted, ProgressBar, Screen, Tag, palette } from "../../components/ui";
import { useData } from "../../lib/data/provider";
import { formatDecimal, formatShortDate } from "../../lib/domain";

type ChallengeTab = "participando" | "descobrir";

const TABS: { id: ChallengeTab; label: string }[] = [
  { id: "participando", label: "Participando" },
  { id: "descobrir", label: "Descobrir" },
];

export default function ChallengesScreen() {
  const { challengeViews, actions } = useData();
  const [tab, setTab] = useState<ChallengeTab>("participando");

  const joined = challengeViews.filter((challenge) => challenge.joined);
  const discover = challengeViews.filter((challenge) => !challenge.joined);
  const visible = tab === "participando" ? joined : discover;

  const toggle = (challengeId: string) => {
    const result = actions.joinChallenge(challengeId);
    Alert.alert(result.ok ? "Tudo certo" : "Inscrição alterada", result.message);
  };

  return (
    <Screen>
      <Kicker>SUPERE SEUS LIMITES</Kicker>
      <Text style={styles.title}>Desafios</Text>
      <Muted>Cada atividade validada conta. Cada meta aproxima você do pódio.</Muted>

      <View style={styles.tabs}>
        {TABS.map((item) => {
          const active = tab === item.id;
          const count = (item.id === "participando" ? joined : discover).length;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(item.id)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {item.label} · {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {visible.length === 0 ? (
        <Card>
          <Muted>
            {tab === "participando"
              ? "Você ainda não entrou em nenhum desafio. Abra a aba Descobrir para participar de um."
              : "Você já está inscrito em todos os desafios disponíveis. Nada novo por aqui."}
          </Muted>
        </Card>
      ) : null}

      {visible.map((challenge) => (
        <Card key={challenge.id} style={!challenge.joined ? styles.inactive : undefined}>
          <View style={styles.top}>
            <View style={styles.topLeft}>
              <Ionicons name="flash-outline" size={18} color={palette.green} />
              <Tag label={challenge.period} />
              {challenge.done ? <Tag label="CONCLUÍDO" color={palette.gold} /> : null}
            </View>
            <Text style={styles.date}>até {formatShortDate(challenge.endsAt)}</Text>
          </View>
          <Text style={styles.name}>{challenge.title}</Text>
          <Muted>{challenge.description}</Muted>
          <View style={styles.rowBetween}>
            <Text style={styles.progress}>
              {formatDecimal(challenge.current)} de {challenge.targetValue} {challenge.unit}
            </Text>
            <Text style={styles.points}>+{challenge.points} PP</Text>
          </View>
          <ProgressBar value={challenge.pct} color={challenge.done ? palette.gold : palette.green} />
          <View style={styles.footer}>
            <Text style={styles.status}>
              {challenge.joined
                ? challenge.done
                  ? "Meta batida — bônus creditado no saldo"
                  : "Inscrito · progresso sincronizado"
                : "Você ainda não está inscrito"}
            </Text>
            <ActionButton
              label={challenge.joined ? "Sair" : "Participar"}
              variant={challenge.joined ? "ghost" : "primary"}
              onPress={() => toggle(challenge.id)}
            />
          </View>
        </Card>
      ))}

      <Card style={styles.note}>
        <Ionicons name="information-circle-outline" size={18} color={palette.green} />
        <Muted>
          A pontuação é calculada apenas sobre atividades validadas. Corridas repetidas do Strava são
          ignoradas para que ninguém pontue duas vezes pelo mesmo treino.
        </Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.text, fontSize: 30, fontWeight: "900", marginTop: -6 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
  },
  tabActive: { backgroundColor: palette.green, borderColor: palette.green },
  tabText: { color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  tabTextActive: { color: "#10170A" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  date: { color: palette.faint, fontSize: 9, fontWeight: "800" },
  name: { color: palette.text, fontSize: 17, fontWeight: "900" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progress: { color: "#D5DEE3", fontSize: 11, fontWeight: "700" },
  points: { color: palette.green, fontSize: 11, fontWeight: "900" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  status: { color: palette.faint, fontSize: 9, flex: 1, lineHeight: 14 },
  inactive: { opacity: 0.85, borderStyle: "dashed" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#17221F", borderColor: "#2A3B33" },
});

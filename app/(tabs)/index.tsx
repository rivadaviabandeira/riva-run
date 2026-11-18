import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActionButton,
  Card,
  IconBadge,
  Kicker,
  Muted,
  ProgressBar,
  Screen,
  SectionTitle,
  StatTile,
  Tag,
  palette,
} from "../../components/ui";
import { useData } from "../../lib/data/provider";
import {
  WEEKDAYS,
  formatDecimal,
  formatPace,
  formatRelative,
  formatShortDate,
  goalLabel,
  levelRules,
  paceSecondsOf,
  sessionType,
  sessionsOfWeek,
} from "../../lib/domain";
import type { IconName } from "../../lib/data/types";

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

export default function HomeScreen() {
  const {
    profile,
    stats,
    strava,
    activities,
    shoes,
    challengeViews,
    athletes,
    trainingSessions,
    actions,
  } = useData();

  const recent = [...activities]
    .filter((activity) => activity.status === "validated")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 3);

  const challenge = challengeViews[0];

  const myAthlete = athletes.find((item) => item.isMe);
  const myWeek = sessionsOfWeek(
    trainingSessions.filter((session) => session.athleteId === myAthlete?.id),
  );
  const nextSession = myWeek.find((session) => !session.done) ?? null;
  const planDone = myWeek.filter((session) => session.done).length;

  const sync = () => {
    const result = actions.syncStrava();
    Alert.alert(result.ok ? "Sincronização concluída" : "Sincronização indisponível", result.message);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Kicker>CORRA NO SEU RITMO</Kicker>
          <Text style={styles.title}>
            Pace<Text style={{ color: palette.green }}>Hub</Text>
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir meu perfil"
          onPress={() => router.push("/perfil")}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initials(profile.name)}</Text>
        </Pressable>
      </View>

      <Card style={styles.hero}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>
              NÍVEL {stats.level.level} · {stats.level.title.toUpperCase()}
            </Text>
            <Text style={styles.pp}>
              {formatDecimal(stats.balancePP)} <Text style={styles.ppUnit}>PP</Text>
            </Text>
            <Muted>Saldo para resgatar na PaceStore</Muted>
          </View>
          <Tag label={`${stats.unlockedAchievements}/9 MEDALHAS`} color={palette.gold} />
        </View>
        <ProgressBar value={stats.level.progress} />
        <Text style={styles.hint}>
          {stats.level.maxed
            ? "Nível máximo de carreira alcançado."
            : `Faltam ${formatDecimal(stats.level.remaining)} PP para o nível ${stats.level.level + 1}`}
        </Text>
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Meta da semana</Text>
          <Text style={styles.greenText}>
            {stats.weeklyRuns} de {stats.weeklyGoalRuns} treinos
          </Text>
        </View>
        <ProgressBar value={stats.weeklyRuns / stats.weeklyGoalRuns} />
        <Muted>
          {formatDecimal(stats.weeklyKm)} km nesta semana · sequência de {stats.weeklyStreak} semana(s)
          com a meta batida
        </Muted>
      </Card>

      <SectionTitle
        right={
          <Text style={styles.link} onPress={() => router.push("/treinos")}>
            TREINADOR
          </Text>
        }
      >
        Plano do treinador
      </SectionTitle>
      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>
            {myAthlete
              ? `Meta ${goalLabel(myAthlete.goal)} · ${levelRules(myAthlete.level).label}`
              : "Sem atleta definido"}
          </Text>
          <Text style={styles.greenText}>
            {planDone}/{myWeek.length} feitos
          </Text>
        </View>
        {nextSession ? (
          <>
            <View style={styles.challengeTop}>
              <IconBadge
                icon={sessionType(nextSession.typeId).icon as IconName}
                color={sessionType(nextSession.typeId).color}
                size={38}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.runTitle}>
                  {sessionType(nextSession.typeId).label} · {formatDecimal(nextSession.distanceKm)} km
                </Text>
                <Muted>
                  {WEEKDAYS[(new Date(nextSession.date).getDay() + 6) % 7]} · pace{" "}
                  {formatPace(nextSession.targetPaceS)}/km
                </Muted>
              </View>
            </View>
            <Text style={styles.small}>{nextSession.note}</Text>
          </>
        ) : (
          <Muted>Sem treino prescrito nesta semana. Monte o plano no modo treinador.</Muted>
        )}
        <ActionButton
          label="Abrir treinos"
          variant="ghost"
          icon="people-outline"
          onPress={() => router.push("/treinos")}
        />
      </Card>

      <Card style={styles.metrics}>
        <StatTile label="CORRIDAS" value={String(stats.validatedRuns)} hint="validadas" />
        <View style={styles.divider} />
        <StatTile label="KM TOTAIS" value={formatDecimal(stats.totalKm)} hint="distância acumulada" />
        <View style={styles.divider} />
        <StatTile
          label="MELHOR PACE"
          value={formatPace(stats.bestPaceS)}
          hint="por quilômetro"
        />
      </Card>

      <SectionTitle right={<Text style={styles.link} onPress={() => router.push("/desafios")}>VER TODOS</Text>}>
        Desafio em destaque
      </SectionTitle>
      {challenge ? (
        <Card>
          <View style={styles.challengeTop}>
            <IconBadge icon="flash-outline" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{challenge.title}</Text>
              <Muted>{challenge.description}</Muted>
            </View>
            <Tag label={challenge.period} />
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.small}>
              {formatDecimal(challenge.current)} de {challenge.targetValue} {challenge.unit}
            </Text>
            <Text style={styles.greenText}>+{challenge.points} PP</Text>
          </View>
          <ProgressBar value={challenge.pct} />
        </Card>
      ) : null}

      <SectionTitle>Sincronizar corridas</SectionTitle>
      <Card>
        <View style={styles.challengeTop}>
          <IconBadge icon="sync-outline" color={palette.blue} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Strava</Text>
            <Muted>
              {strava.connected
                ? `Conectado como ${strava.athleteName ?? profile.name} · última sincronização ${formatRelative(strava.lastSyncAt)}`
                : "Conecte sua conta para importar as corridas automaticamente."}
            </Muted>
          </View>
        </View>
        <View style={styles.actionsRow}>
          <ActionButton
            label={strava.connected ? "Sincronizar agora" : "Conectar Strava"}
            icon="sync-outline"
            onPress={sync}
          />
          <ActionButton
            label="Perfil e conexões"
            variant="ghost"
            onPress={() => router.push("/perfil")}
          />
        </View>
      </Card>

      <SectionTitle>Últimas corridas</SectionTitle>
      {recent.map((activity) => (
        <Card key={activity.id} style={styles.run}>
          <IconBadge icon="walk-outline" size={36} />
          <View style={{ flex: 1 }}>
            <Text style={styles.runTitle}>{activity.title}</Text>
            <Muted>
              {formatShortDate(activity.startedAt)} · {formatDecimal(activity.distanceKm)} km ·{" "}
              {formatPace(paceSecondsOf(activity))}/km
            </Muted>
          </View>
          <Text style={styles.runShoe}>
            {activity.shoeId
              ? shoes.find((shoe) => shoe.id === activity.shoeId)?.model ?? "—"
              : "sem tênis"}
          </Text>
        </Card>
      ))}

      <Card style={styles.steward}>
        <View style={styles.challengeTop}>
          <IconBadge icon="shield-checkmark-outline" color={palette.gold} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Agente de dados</Text>
            <Muted>
              {stats.validatedRuns} corridas validadas · {formatDecimal(stats.lifetimePP)} PP de
              carreira
            </Muted>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.faint} />
        </View>
        <ActionButton
          label="Revisar integridade dos dados"
          variant="ghost"
          onPress={() => router.push("/perfil")}
        />
      </Card>

      <Text style={styles.footnote}>
        Modo demonstração · dados locais, sem sincronização real com o Strava.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: palette.text, fontSize: 32, fontWeight: "900", marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#263522",
    borderWidth: 1,
    borderColor: "#3A4A33",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: palette.green, fontWeight: "900", fontSize: 14 },
  hero: { backgroundColor: palette.cardAlt, borderColor: palette.lineStrong },
  heroEyebrow: { color: "#C3D0C7", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  pp: { color: palette.text, fontSize: 42, fontWeight: "900", marginTop: 2 },
  ppUnit: { fontSize: 18, color: palette.green },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  hint: { color: palette.faint, fontSize: 10 },
  cardTitle: { color: palette.text, fontSize: 14, fontWeight: "900" },
  greenText: { color: palette.green, fontSize: 11, fontWeight: "900" },
  metrics: { flexDirection: "row", alignItems: "center" },
  divider: { width: 1, height: 34, backgroundColor: palette.line },
  link: { color: palette.green, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  challengeTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  small: { color: "#D5DEE3", fontSize: 11, fontWeight: "700" },
  actionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  run: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12 },
  runTitle: { color: palette.text, fontSize: 12, fontWeight: "800" },
  runShoe: { color: palette.faint, fontSize: 9, fontWeight: "800", maxWidth: 80, textAlign: "right" },
  steward: { backgroundColor: "#17221F", borderColor: "#2A3B33" },
  footnote: { color: palette.faint, fontSize: 10, textAlign: "center", marginTop: 4 },
});

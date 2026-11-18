import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  formatShortDate,
  goalLabel,
  levelRules,
  reviewWeek,
  sessionType,
  sessionsOfWeek,
  weekAdherence,
} from "../../lib/domain";
import type { IconName } from "../../lib/data/types";

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

const REVIEW_LABEL = { ok: "Carga liberada", atencao: "Revisar", risco: "Ajustar" } as const;

export default function TrainingScreen() {
  const { athletes, trainingSessions, actions } = useData();
  const me = athletes.find((item) => item.isMe);
  // Abre no atleta logado; só cai no primeiro da lista se não houver "você" definido.
  const [athleteId, setAthleteId] = useState(() => me?.id ?? athletes[0]?.id ?? "");

  // O fallback em `me` cobre o caso de os atletas chegarem depois do primeiro render.
  const athlete = athletes.find((item) => item.id === athleteId) ?? me ?? athletes[0];
  const isViewingOwnPlan = Boolean(athlete && me && athlete.id === me.id);

  const week = useMemo(
    () => sessionsOfWeek(trainingSessions.filter((session) => session.athleteId === athlete?.id)),
    [trainingSessions, athlete?.id],
  );

  const review = useMemo(
    () => (athlete ? reviewWeek(week, athlete) : null),
    [week, athlete],
  );
  const adherence = weekAdherence(week);

  const buildWeek = () => {
    if (!athlete) return;
    const result = actions.buildWeekPlanFor(athlete.id);
    Alert.alert(result.ok ? "Semana montada" : "Não foi possível montar", result.message);
  };

  const reviewColor =
    review?.level === "risco" ? "#FF9C93" : review?.level === "atencao" ? palette.gold : palette.green;

  const days = WEEKDAYS.map((label, index) => ({
    label,
    sessions: week.filter((session) => (new Date(session.date).getDay() + 6) % 7 === index),
  }));

  return (
    <Screen>
      <Kicker>MODO TREINADOR</Kicker>
      <Text style={styles.title}>
        Treinos<Text style={{ color: palette.green }}> por atleta</Text>
      </Text>
      <Muted>
        Monte a semana de cada corredor com tipo de sessão, distância e pace alvo. Antes de liberar, o
        plano passa por uma revisão de carga.
      </Muted>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {athletes.map((item) => {
          const active = item.id === athlete?.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setAthleteId(item.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <View style={[styles.chipAvatar, active && { backgroundColor: "#10170A" }]}>
                <Text style={[styles.chipAvatarText, active && { color: palette.green }]}>
                  {initials(item.name)}
                </Text>
              </View>
              <View>
                <Text style={[styles.chipName, active && { color: "#10170A" }]}>
                  {item.name.split(" ")[0]}
                </Text>
                <Text style={[styles.chipMeta, active && { color: "#2C3A12" }]}>
                  {item.isMe ? "você" : levelRules(item.level).label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {athlete && me && !isViewingOwnPlan ? (
        <View style={styles.planBanner}>
          <Ionicons name="eye-outline" size={15} color={palette.gold} />
          <Text style={styles.planBannerText}>
            Você está vendo o plano de{" "}
            <Text style={styles.planBannerName}>{athlete.name}</Text> — não o seu.
          </Text>
          {me ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar para o meu plano"
              hitSlop={8}
              onPress={() => setAthleteId(me.id)}
            >
              <Text style={styles.planBannerAction}>MEU PLANO</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {athlete && review ? (
        <>
          <Card style={styles.athlete}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.athleteName}>{athlete.name}</Text>
                <Muted>
                  Meta {goalLabel(athlete.goal)} · {levelRules(athlete.level).label} · pace base{" "}
                  {formatPace(athlete.basePaceS)}/km
                </Muted>
              </View>
              <Tag label={goalLabel(athlete.goal).toUpperCase()} color={palette.blue} />
            </View>
            <View style={styles.metrics}>
              <StatTile
                label="PRESCRITO"
                value={`${formatDecimal(review.prescribedKm)} km`}
                hint={`${week.length} treinos`}
              />
              <View style={styles.divider} />
              <StatTile
                label="QUALIDADE"
                value={String(review.qualitySessions)}
                hint={`limite ${levelRules(athlete.level).maxQuality}`}
              />
              <View style={styles.divider} />
              <StatTile label="DESCANSO" value={String(review.restDays)} hint="dias livres" />
            </View>
            <ProgressBar value={adherence.pct} />
            <Muted>
              {adherence.done} de {adherence.total} concluídos · {formatDecimal(adherence.kmDone)} de{" "}
              {formatDecimal(adherence.kmTotal)} km executados
            </Muted>
          </Card>

          <Card style={[styles.review, { borderColor: `${reviewColor}55` }]}>
            <View style={styles.rowBetween}>
              <View style={styles.challengeTop}>
                <IconBadge icon="shield-checkmark-outline" color={reviewColor} size={34} />
                <Text style={styles.cardTitle}>Revisão da semana</Text>
              </View>
              <Tag label={REVIEW_LABEL[review.level].toUpperCase()} color={reviewColor} />
            </View>
            {review.messages.length === 0 ? (
              <Muted>
                Volume, sessões intensas e descanso dentro do planejado para o nível do atleta.
              </Muted>
            ) : (
              review.messages.map((message) => (
                <View key={message} style={styles.issue}>
                  <Ionicons
                    name={review.level === "risco" ? "alert-circle-outline" : "information-circle-outline"}
                    size={14}
                    color={reviewColor}
                  />
                  <Text style={styles.issueText}>{message}</Text>
                </View>
              ))
            )}
          </Card>

          <View style={styles.actionsRow}>
            <ActionButton label="Montar semana" icon="sparkles-outline" onPress={buildWeek} />
            <ActionButton
              label="Treino avulso"
              icon="add-outline"
              variant="ghost"
              onPress={() =>
                router.push({ pathname: "/montar-treino", params: { athleteId: athlete.id } })
              }
            />
          </View>

          <SectionTitle right={<Text style={styles.count}>{week.length} na semana</Text>}>
            Semana atual
          </SectionTitle>

          {week.length === 0 ? (
            <Card>
              <Muted>
                Nenhum treino prescrito. Toque em “Montar semana” para gerar o plano do atleta ou
                adicione um treino avulso.
              </Muted>
            </Card>
          ) : null}

          {days
            .filter((day) => day.sessions.length > 0)
            .map((day) => (
              <View key={day.label} style={styles.dayGroup}>
                <Text style={styles.dayLabel}>{day.label.toUpperCase()}</Text>
                {day.sessions.map((session) => {
                  const type = sessionType(session.typeId);
                  const isOwnSession = session.athleteId === me?.id;
                  return (
                    <Card key={session.id} style={styles.session}>
                      <View style={styles.sessionRow}>
                        <IconBadge icon={type.icon as IconName} color={type.color} size={38} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sessionTitle}>{type.label}</Text>
                          <Muted>
                            {formatDecimal(session.distanceKm)} km · pace {formatPace(session.targetPaceS)}
                            /km
                          </Muted>
                        </View>
                        {isOwnSession && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              session.done ? "Reabrir treino" : "Marcar treino como concluído"
                            }
                            hitSlop={8}
                            onPress={async () => {
                              const result = await actions.toggleTrainingDone(session.id);
                              Alert.alert(result.ok ? "Treino atualizado" : "Não foi possível atualizar", result.message);
                            }}
                            style={[styles.check, session.done && styles.checkDone]}
                          >
                          <Ionicons
                            name={session.done ? "checkmark" : "ellipse-outline"}
                            size={17}
                            color={session.done ? "#10170A" : palette.muted}
                          />
                        </Pressable>
                        )}
                      </View>
                      <Text style={styles.note}>{session.note}</Text>
                      <View style={styles.sessionFooter}>
                                                  <Text style={styles.sessionMeta}>
                          {formatShortDate(session.date)}· {type.quality ? "QUALIDADE" : "BASE"}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Remover treino"
                          hitSlop={8}
                          onPress={() => actions.removeTrainingSession(session.id)}
                        >
                          <Ionicons name="trash-outline" size={15} color={palette.faint} />
                        </Pressable>
                      </View>
                    </Card>
                  );
                })}
              </View>
            ))}

          <Muted>
            O pace de cada sessão parte do pace base do atleta: intervalado mais forte, rodagem e
            regenerativo mais leves. Volume semanal cresce no máximo 10%.
          </Muted>
        </>
      ) : (
        <Card>
          <Muted>Nenhum atleta disponível para prescrever treinos.</Muted>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.text, fontSize: 27, fontWeight: "900", marginTop: -4 },
  chips: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
  },
  chipActive: { backgroundColor: palette.green, borderColor: palette.green },
  chipAvatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#263522",
    alignItems: "center",
    justifyContent: "center",
  },
  chipAvatarText: { color: palette.green, fontSize: 10, fontWeight: "900" },
  chipName: { color: palette.text, fontSize: 11, fontWeight: "900" },
  chipMeta: { color: palette.faint, fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  planBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${palette.gold}55`,
    backgroundColor: "#241F14",
  },
  planBannerText: { color: "#E3DCC8", fontSize: 10, lineHeight: 15, flex: 1 },
  planBannerName: { color: palette.text, fontWeight: "900" },
  planBannerAction: { color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  athlete: { backgroundColor: palette.cardAlt, borderColor: palette.lineStrong },
  athleteName: { color: palette.text, fontSize: 17, fontWeight: "900" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  metrics: { flexDirection: "row", alignItems: "center" },
  divider: { width: 1, height: 32, backgroundColor: palette.line },
  review: { backgroundColor: "#151F24" },
  challengeTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { color: palette.text, fontSize: 14, fontWeight: "900" },
  issue: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  issueText: { color: "#D5DEE3", fontSize: 10, lineHeight: 15, flex: 1 },
  actionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  count: { color: palette.muted, fontSize: 9 },
  dayGroup: { gap: 8 },
  dayLabel: { color: palette.faint, fontSize: 9, fontWeight: "900", letterSpacing: 1.6, marginTop: 2 },
  session: { gap: 7 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  sessionTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
  note: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  sessionFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sessionMeta: { color: palette.faint, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  check: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkDone: { backgroundColor: palette.green, borderColor: palette.green },
});

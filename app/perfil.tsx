import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
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
} from "../components/ui";
import { useData } from "../lib/data/provider";
import { useAuth } from "../lib/auth/provider";
import { captureWebStravaReturn, consumeStravaReturn, startStravaConnect } from "../lib/strava";
import {
  formatDecimal,
  formatPace,
  formatRelative,
  formatShortDate,
  paceSecondsOf,
} from "../lib/domain";

export default function ProfileScreen() {
  const { profile, stats, strava, steward, activities, shoes, actions, mode, reloadData } = useData();
  const { user, signOut } = useAuth();

  const [stravaNotice, setStravaNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [stravaBusy, setStravaBusy] = useState(false);

  // O callback do OAuth volta para o app com ?strava=connected: mostra o resultado
  // e recarrega para refletir a conexão que a Edge Function gravou.
  useEffect(() => {
    captureWebStravaReturn();
    const pending = consumeStravaReturn();
    if (!pending) return;
    setStravaNotice(pending);
    if (pending.ok) void reloadData();
  }, [reloadData]);

  const connectStravaAccount = async () => {
    if (stravaBusy) return;
    setStravaBusy(true);
    setStravaNotice(null);
    const result = await startStravaConnect();
    setStravaBusy(false);
    // No web a aba saiu para o Strava; o resultado volta pelo efeito acima.
    if (result.ok && Platform.OS === "web") return;
    setStravaNotice(result);
    if (result.ok) await reloadData();
  };

  const pending = activities.filter((activity) => activity.status === "pending");
  const unassigned = activities.filter(
    (activity) => activity.status === "validated" && !activity.shoeId,
  );

  const audit = () => {
    const report = actions.runStewardAudit();
    Alert.alert("Agente de dados", report.summary);
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Ionicons name="chevron-back" size={20} color={palette.text} onPress={() => router.back()} />
        <Text style={styles.topTitle}>Perfil</Text>
        <View style={{ width: 20 }} />
      </View>

      <Card style={styles.profile}>
        <View style={styles.profileTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </Text>
          </View>
          <View style={styles.identity}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.handle}>
              {profile.city ? `${profile.handle} · ${profile.city}` : profile.handle}
            </Text>
          </View>
        </View>
        <View style={styles.profileBottom}>
          <Tag label={`NÍVEL ${stats.level.level}`} color={palette.gold} />
          <Text style={styles.since}>
            No PaceHub desde {formatShortDate(profile.joinedAt)}
          </Text>
        </View>
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>{stats.level.title}</Text>
          <Text style={styles.greenText}>{formatDecimal(stats.lifetimePP)} PP de carreira</Text>
        </View>
        <ProgressBar value={stats.level.progress} />
        <Muted>
          {stats.level.maxed
            ? "Nível máximo alcançado."
            : `Faltam ${formatDecimal(stats.level.remaining)} PP para o nível ${stats.level.level + 1}. 1 km validado = 1 PP.`}
        </Muted>
      </Card>

      <Card style={styles.metrics}>
        <StatTile label="KM TOTAIS" value={formatDecimal(stats.totalKm)} hint="validados" />
        <View style={styles.divider} />
        <StatTile label="CORRIDAS" value={String(stats.validatedRuns)} hint="importadas" />
        <View style={styles.divider} />
        <StatTile label="MELHOR PACE" value={formatPace(stats.bestPaceS)} hint="por km" />
      </Card>

      <Card style={styles.metrics}>
        <StatTile label="SALDO" value={formatDecimal(stats.balancePP)} hint="PP disponíveis" />
        <View style={styles.divider} />
        <StatTile label="SEQUÊNCIA" value={`${stats.weeklyStreak}`} hint="semanas na meta" />
        <View style={styles.divider} />
        <StatTile label="TÊNIS" value={`${stats.activeShoes}/5`} hint="pares ativos" />
      </Card>

      <SectionTitle
        right={
          <Text style={styles.link} onPress={() => router.push("/conquistas")}>
            VER MEDALHAS
          </Text>
        }
      >
        Conquistas
      </SectionTitle>
      <Card>
        <View style={styles.rowBetween}>
          <View style={styles.row}>
            <IconBadge icon="medal-outline" color={palette.gold} />
            <View>
              <Text style={styles.cardTitle}>
                {stats.unlockedAchievements} de {stats.achievements.length} medalhas
              </Text>
              <Muted>
                {stats.completedChallenges} desafio(s) concluído(s) · +15 PP cada
              </Muted>
            </View>
          </View>
          <ActionButton label="Abrir" variant="ghost" onPress={() => router.push("/conquistas")} />
        </View>
        <ProgressBar
          value={stats.unlockedAchievements / stats.achievements.length}
          color={palette.gold}
        />
      </Card>

      <SectionTitle>Conexão Strava</SectionTitle>
      <Card>
        <View style={styles.row}>
          <IconBadge icon="sync-outline" color={palette.blue} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{strava.connected ? "Conectado" : "Desconectado"}</Text>
            <Muted>
              {strava.connected
                ? strava.athleteName
                  ? `Atleta ${strava.athleteName} · sincronizado ${formatRelative(strava.lastSyncAt)}`
                  : `Atleta ${strava.athleteId ?? "—"} · corridas importadas pelo servidor`
                : "Sem conexão ativa. Nenhuma atividade nova é importada."}
            </Muted>
          </View>
        </View>
        {mode !== "demo" ? (
          <View style={styles.buttons}>
            {stravaNotice ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Ionicons
                  name={stravaNotice.ok ? "checkmark-circle-outline" : "alert-circle-outline"}
                  size={15}
                  color={stravaNotice.ok ? palette.green : "#FF9C93"}
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 10,
                    fontWeight: "800",
                    lineHeight: 15,
                    color: stravaNotice.ok ? palette.green : "#FF9C93",
                  }}
                >
                  {stravaNotice.message}
                </Text>
              </View>
            ) : null}
            <ActionButton
              label={
                stravaBusy
                  ? "Abrindo o Strava…"
                  : strava.connected
                    ? "Reconectar Strava"
                    : "Conectar Strava"
              }
              icon="link-outline"
              onPress={connectStravaAccount}
              disabled={stravaBusy}
            />
          </View>
        ) : (
        <View style={styles.buttons}>
          {strava.connected ? (
            <>
              <ActionButton
                label="Sincronizar"
                icon="sync-outline"
                onPress={() => {
                  const result = actions.syncStrava();
                  Alert.alert("Strava", result.message);
                }}
              />
              <ActionButton
                label="Desconectar"
                variant="danger"
                onPress={() => {
                  const result = actions.disconnectStrava();
                  Alert.alert("Strava", result.message);
                }}
              />
            </>
          ) : (
            <ActionButton
              label="Conectar Strava"
              icon="link-outline"
              onPress={() => {
                const result = actions.connectStrava();
                Alert.alert("Strava", result.message);
              }}
            />
          )}
        </View>
        )}
        <Muted>
          Tokens do Strava ficam somente no servidor. O app nunca recebe nem armazena o refresh token.
        </Muted>
      </Card>

      <SectionTitle
        right={
          <Text style={styles.link} onPress={audit}>
            RODAR AUDITORIA
          </Text>
        }
      >
        Agente de dados
      </SectionTitle>
      <Card style={styles.stewardCard}>
        <View style={styles.row}>
          <IconBadge icon="shield-checkmark-outline" color={palette.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{steward.summary}</Text>
            <Muted>
              Última varredura {formatRelative(steward.checkedAt)} · {steward.checkedActivities}{" "}
              atividades e {steward.checkedShoes} tênis verificados
            </Muted>
          </View>
        </View>
        {steward.issues.length === 0 ? (
          <Muted>Nenhuma pendência. A base está consistente.</Muted>
        ) : (
          steward.issues.map((issue) => (
            <View key={issue.id} style={styles.issue}>
              <View style={styles.issueHeader}>
                <Tag
                  label={issue.severity.toUpperCase()}
                  color={
                    issue.severity === "alta"
                      ? "#FF9C93"
                      : issue.severity === "média"
                        ? palette.gold
                        : palette.blue
                  }
                />
                <Text style={styles.issueTitle}>{issue.title}</Text>
              </View>
              <Muted>{issue.detail}</Muted>
              {issue.activityId && issue.kind === "pendente" ? (
                <View style={styles.buttons}>
                  <ActionButton
                    label="Validar"
                    onPress={() => {
                      const result = actions.reviewActivity(issue.activityId as string, "validated");
                      Alert.alert("Agente de dados", result.message);
                    }}
                  />
                  <ActionButton
                    label="Rejeitar"
                    variant="danger"
                    onPress={() => {
                      const result = actions.reviewActivity(issue.activityId as string, "rejected");
                      Alert.alert("Agente de dados", result.message);
                    }}
                  />
                </View>
              ) : null}
            </View>
          ))
        )}
      </Card>

      {pending.length > 0 ? (
        <>
          <SectionTitle>Importações pendentes</SectionTitle>
          {pending.map((activity) => (
            <Card key={activity.id}>
              <Text style={styles.cardTitle}>{activity.title}</Text>
              <Muted>
                {formatShortDate(activity.startedAt)} · {formatDecimal(activity.distanceKm)} km ·{" "}
                {formatPace(paceSecondsOf(activity))}/km
              </Muted>
              <View style={styles.buttons}>
                <ActionButton
                  label="Validar"
                  onPress={() => {
                    const result = actions.reviewActivity(activity.id, "validated");
                    Alert.alert("Agente de dados", result.message);
                  }}
                />
                <ActionButton
                  label="Rejeitar"
                  variant="danger"
                  onPress={() => {
                    const result = actions.reviewActivity(activity.id, "rejected");
                    Alert.alert("Agente de dados", result.message);
                  }}
                />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {unassigned.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>
            {unassigned.length} corrida(s) sem tênis associado
          </Text>
          <Muted>
            {shoes.length > 0
              ? "Associe em Meus tênis para somar a quilometragem do par correto."
              : "Cadastre um par em Meus tênis para acompanhar a quilometragem."}
          </Muted>
          <ActionButton label="Abrir meus tênis" variant="ghost" onPress={() => router.push("/tenis")} />
        </Card>
      ) : null}

      <SectionTitle>Conta</SectionTitle>
      <Card>
        <View style={styles.row}>
          <IconBadge icon="person-circle-outline" color={palette.blue} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{user?.email ?? "Modo demonstração"}</Text>
            <Muted>
              {mode === "demo"
                ? "Dados locais de demonstração — nada é enviado ao servidor."
                : "Perfil, corridas e pontos carregados do Supabase com a sua conta."}
            </Muted>
          </View>
        </View>
        <ActionButton label="Sair da conta" variant="ghost" icon="log-out-outline" onPress={signOut} />
        {mode === "demo" ? null : (
          <Muted>
            Ações que ainda não têm RPC no banco (entrar em desafio, cadastrar tênis, prescrever
            treino) valem só nesta sessão.
          </Muted>
        )}
      </Card>

      {mode === "demo" ? (
        <Card>
          <ActionButton
            label="Restaurar dados de demonstração"
            variant="ghost"
            onPress={actions.resetDemo}
          />
          <Muted>Todos os dados deste protótipo são locais e voltam ao estado inicial ao restaurar.</Muted>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topTitle: { color: palette.text, fontSize: 17, fontWeight: "900" },
  profile: { gap: 12 },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "#263522",
    borderWidth: 1,
    borderColor: "#3A4A33",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: palette.green, fontSize: 21, fontWeight: "900" },
  identity: { flex: 1, gap: 3 },
  name: { color: palette.text, fontSize: 22, fontWeight: "900" },
  handle: { color: palette.green, fontSize: 12, fontWeight: "800" },
  since: { color: palette.faint, fontSize: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 11, flex: 1 },
  cardTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
  greenText: { color: palette.green, fontSize: 10, fontWeight: "900" },
  metrics: { flexDirection: "row", alignItems: "center" },
  divider: { width: 1, height: 34, backgroundColor: palette.line },
  link: { color: palette.green, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  buttons: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  stewardCard: { backgroundColor: "#17221F", borderColor: "#2A3B33" },
  issue: { borderTopWidth: 1, borderTopColor: "#26333B", paddingTop: 9, gap: 5 },
  issueHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  issueTitle: { color: palette.text, fontSize: 11, fontWeight: "800" },
});

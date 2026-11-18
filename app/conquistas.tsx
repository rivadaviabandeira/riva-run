import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Kicker, Muted, ProgressBar, Screen, palette } from "../components/ui";
import { useData } from "../lib/data/provider";
import { ACHIEVEMENT_CATEGORIES } from "../lib/domain";
import type { IconName } from "../lib/data/types";

export default function AchievementsScreen() {
  const { stats } = useData();

  return (
    <Screen>
      <View style={styles.topBar}>
        <Ionicons name="chevron-back" size={20} color={palette.text} onPress={() => router.back()} />
        <Text style={styles.topTitle}>Conquistas</Text>
        <View style={{ width: 20 }} />
      </View>

      <Kicker>SUA COLEÇÃO DE MEDALHAS</Kicker>
      <Text style={styles.title}>
        {stats.unlockedAchievements} de {stats.achievements.length}
      </Text>
      <Muted>
        Medalhas são desbloqueadas por corridas validadas, semanas dentro da meta e recordes de pace.
      </Muted>
      <ProgressBar
        value={stats.unlockedAchievements / stats.achievements.length}
        color={palette.gold}
        height={8}
      />

      {ACHIEVEMENT_CATEGORIES.map((category) => {
        const items = stats.achievements.filter((item) => item.spec.category === category.id);
        const unlocked = items.filter((item) => item.unlocked).length;
        return (
          <View key={category.id} style={styles.group}>
            <View style={styles.groupHeader}>
              <Ionicons name={category.icon as IconName} size={16} color={category.color} />
              <Text style={styles.groupTitle}>{category.title}</Text>
              <Text style={[styles.groupCount, { color: category.color }]}>
                {unlocked}/{items.length}
              </Text>
            </View>
            {items.map((item) => (
              <Card
                key={item.spec.id}
                style={[
                  styles.medal,
                  item.unlocked ? { borderColor: `${category.color}66` } : { opacity: 0.72 },
                ]}
              >
                <View
                  style={[
                    styles.medalIcon,
                    { backgroundColor: item.unlocked ? `${category.color}22` : "#1A2329" },
                  ]}
                >
                  <Ionicons
                    name={item.unlocked ? "medal" : "lock-closed-outline"}
                    size={20}
                    color={item.unlocked ? category.color : palette.faint}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medalTitle}>{item.spec.title}</Text>
                  <Muted>{item.spec.description}</Muted>
                  <ProgressBar value={item.progress} color={category.color} height={4} />
                  <Text style={styles.medalValue}>{item.valueLabel}</Text>
                </View>
                {item.unlocked ? (
                  <Text style={[styles.unlocked, { color: category.color }]}>OK</Text>
                ) : null}
              </Card>
            ))}
          </View>
        );
      })}

      <Card>
        <Muted>
          A verificação das medalhas é feita pelo backend a partir das atividades validadas. O app apenas
          apresenta o resultado — nenhuma medalha é concedida pelo cliente.
        </Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topTitle: { color: palette.text, fontSize: 15, fontWeight: "900" },
  title: { color: palette.text, fontSize: 30, fontWeight: "900", marginTop: -6 },
  group: { gap: 9, marginTop: 6 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  groupTitle: { color: palette.text, fontSize: 13, fontWeight: "900", flex: 1 },
  groupCount: { fontSize: 10, fontWeight: "900" },
  medal: { flexDirection: "row", alignItems: "center", gap: 11 },
  medalIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  medalTitle: { color: palette.text, fontSize: 12, fontWeight: "900" },
  medalValue: { color: palette.faint, fontSize: 9, marginTop: 3 },
  unlocked: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
});

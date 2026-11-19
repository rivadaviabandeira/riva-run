import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Kicker, Muted, Screen, SectionTitle, palette } from "../../components/ui";
import { useData } from "../../lib/data/provider";
import { formatDecimal, rankBand } from "../../lib/domain";

export default function RankingScreen() {
  const { profile, stats, shoes, rivals } = useData();

  // No modo demonstração o ranking traz adversários fictícios; com conta real
  // ainda não há pontos de outros participantes expostos, então aparece só você.
  const entries = [
    ...rivals,
    {
      name: profile.name,
      points: Math.round(stats.lifetimePP),
      km: stats.totalKm,
      isMe: true,
    },
  ].sort((a, b) => b.points - a.points);

  const podium = entries.slice(0, 3);

  const mostUsed = shoes
    .map((shoe) => ({ shoe, km: stats.shoeKmById[shoe.id] ?? 0 }))
    .sort((a, b) => b.km - a.km)[0];

  return (
    <Screen>
      <Kicker>CORRER JUNTO É MELHOR</Kicker>
      <Text style={styles.title}>Ranking</Text>
      <Muted>
        Classificação do desafio mensal por PP de carreira. Seu saldo disponível pode ser menor porque
        resgates já foram feitos.
      </Muted>

      <Card style={styles.podium}>
        <Ionicons name="trophy" size={26} color={palette.gold} />
        <Text style={styles.podiumTitle}>Pódio do desafio</Text>
        <Muted>Os três primeiros colocados</Muted>
        <View style={styles.podiumRow}>
          {podium.map((entry, index) => {
            const color = rankBand(index + 1).color;
            return (
              <View key={entry.name} style={styles.person}>
                <View style={[styles.avatar, { borderColor: color }]}>
                  <Text style={{ color, fontWeight: "900", fontSize: 12 }}>
                    {entry.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </Text>
                </View>
                <Text style={styles.podiumName} numberOfLines={1}>
                  {entry.name.split(" ")[0]}
                </Text>
                <Text style={{ color, fontWeight: "900", fontSize: 11 }}>{Math.round(entry.points)}</Text>
                <View
                  style={[
                    styles.bar,
                    {
                      height: index === 0 ? 62 : index === 1 ? 50 : 38,
                      borderColor: color,
                      backgroundColor: `${color}30`,
                    },
                  ]}
                >
                  <Text style={{ color, fontWeight: "900", fontSize: 11 }}>{index + 1}º</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <SectionTitle>Classificação por faixa</SectionTitle>
      <View style={styles.legend}>
        <Text style={{ color: palette.gold, fontSize: 10 }}>● 1º–3º</Text>
        <Text style={{ color: palette.blue, fontSize: 10 }}>● 4º–10º</Text>
        <Text style={{ color: "#69D6A5", fontSize: 10 }}>● 11º–20º</Text>
        <Text style={{ color: palette.muted, fontSize: 10 }}>● 21º+</Text>
      </View>

      {entries.map((entry, index) => {
        const band = rankBand(index + 1);
        return (
          <View
            key={entry.name}
            style={[
              styles.row,
              { borderLeftColor: band.color },
              entry.isMe && { backgroundColor: "#17221F" },
            ]}
          >
            <Text style={[styles.pos, { color: band.color }]}>{String(index + 1).padStart(2, "0")}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {entry.name}
                {entry.isMe ? " (você)" : ""}
              </Text>
              <Text style={styles.sub}>{formatDecimal(entry.km)} km no desafio</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.points}>{Math.round(entry.points)} pts</Text>
              <Text style={{ color: band.color, fontSize: 9, fontWeight: "900" }}>{band.label}</Text>
            </View>
          </View>
        );
      })}

      <Card style={styles.callout}>
        <Ionicons name="footsteps-outline" color={palette.green} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>Tênis mais usado</Text>
          <Muted>
            {mostUsed
              ? `${mostUsed.shoe.brand} ${mostUsed.shoe.model} · ${formatDecimal(mostUsed.km)} km válidos no desafio.`
              : "Associe um tênis às corridas para ver este resultado."}
          </Muted>
        </View>
      </Card>
      <Muted>
        {rivals.length > 0
          ? "Participantes adversários são fictícios; sua pontuação é calculada pelos dados do app."
          : "A classificação real com outros corredores entra quando a pontuação pública estiver disponível. Por enquanto, aparece só você."}
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.text, fontSize: 30, fontWeight: "900", marginTop: -6 },
  podium: { alignItems: "center", backgroundColor: "#141F22", borderColor: palette.line },
  podiumTitle: { color: palette.text, fontSize: 17, fontWeight: "900" },
  podiumRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 10, marginTop: 14, width: "100%" },
  person: { flex: 1, alignItems: "center", gap: 5 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "#202A30" },
  podiumName: { color: palette.text, fontSize: 10, fontWeight: "800" },
  bar: { width: "100%", borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.line,
    borderLeftWidth: 4,
    borderRadius: 13,
    padding: 13,
  },
  pos: { fontSize: 15, fontWeight: "900", width: 24 },
  name: { color: palette.text, fontSize: 12, fontWeight: "800" },
  sub: { color: palette.muted, fontSize: 10, marginTop: 2 },
  points: { color: palette.text, fontSize: 12, fontWeight: "900" },
  callout: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: palette.cardAlt, borderColor: palette.lineStrong },
});

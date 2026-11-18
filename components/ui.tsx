import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IconName } from "../lib/data/types";

export const palette = {
  screen: "#0B1014",
  card: "#131C22",
  cardAlt: "#1A272B",
  line: "#26333B",
  lineStrong: "#34443B",
  green: "#B8F34A",
  blue: "#65B8FF",
  gold: "#E6B84B",
  text: "#F5F8FA",
  muted: "#93A1AA",
  faint: "#65737C",
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <Text style={styles.kicker}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ProgressBar({
  value,
  color = palette.green,
  height = 6,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={[styles.track, { height }]}>
      <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: color, borderRadius: 8 }} />
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  icon,
  variant = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.buttonPrimary,
        variant === "ghost" && styles.buttonGhost,
        variant === "danger" && styles.buttonDanger,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={isPrimary ? "#10170A" : variant === "danger" ? "#FF9C93" : palette.text} />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          isPrimary && { color: "#10170A" },
          variant === "danger" && { color: "#FF9C93" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function IconBadge({
  icon,
  color = palette.green,
  size = 42,
}: {
  icon: IconName;
  color?: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconBadge,
        { width: size, height: size, borderRadius: Math.round(size / 3), backgroundColor: `${color}1F` },
      ]}
    >
      <Ionicons name={icon} size={Math.round(size / 2)} color={color} />
    </View>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function Tag({ label, color = palette.green }: { label: string; color?: string }) {
  return (
    <View style={[styles.tag, { borderColor: `${color}55`, backgroundColor: `${color}18` }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.screen },
  content: { padding: 20, paddingTop: 26, paddingBottom: 36, gap: 14 },
  kicker: { color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  title: { color: palette.text, fontSize: 30, fontWeight: "900", marginTop: 2 },
  subtitle: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  section: { color: palette.text, fontSize: 16, fontWeight: "900" },
  muted: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    gap: 9,
  },
  track: { backgroundColor: "#303D44", borderRadius: 8, overflow: "hidden", marginTop: 8 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonPrimary: { backgroundColor: palette.green },
  buttonGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: palette.lineStrong },
  buttonDanger: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#5A2A2A" },
  buttonText: { color: palette.text, fontSize: 11, fontWeight: "900" },
  iconBadge: { alignItems: "center", justifyContent: "center" },
  statTile: { flex: 1, gap: 4 },
  statLabel: { color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  statValue: { color: palette.text, fontSize: 20, fontWeight: "900" },
  statHint: { color: palette.faint, fontSize: 9 },
  tag: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
});

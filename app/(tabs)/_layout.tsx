import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const green = "#B8F34A";
const muted = "#82909A";
export default function TabLayout() {
  return <Tabs screenOptions={{
    headerShown: false, tabBarActiveTintColor: green, tabBarInactiveTintColor: muted,
    tabBarStyle: { backgroundColor: "#11191F", borderTopColor: "#202B32", height: 64, paddingTop: 7, paddingBottom: 8 },
    tabBarLabelStyle: { fontSize: 11, fontWeight: "600" }
  }}>
    <Tabs.Screen name="index" options={{ title:"Início", tabBarIcon:({color,size})=><Ionicons name="home-outline" color={color} size={size}/> }} />
    <Tabs.Screen name="desafios" options={{ title:"Desafios", tabBarIcon:({color,size})=><Ionicons name="flag-outline" color={color} size={size}/> }} />
    <Tabs.Screen name="tenis" options={{ title:"Meus tênis", tabBarIcon:({color,size})=><Ionicons name="footsteps-outline" color={color} size={size}/> }} />
    <Tabs.Screen name="ranking" options={{ title:"Ranking", tabBarIcon:({color,size})=><Ionicons name="trophy-outline" color={color} size={size}/> }} />
  </Tabs>;
}
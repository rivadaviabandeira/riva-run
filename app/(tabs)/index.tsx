import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
const green="#B8F34A", muted="#93A1AA", card="#131C22", line="#26333B";
function Metric({label,value}:{label:string;value:string}) {
 return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text></View>;
}
export default function HomeScreen() {
 return <ScrollView style={s.screen} contentContainerStyle={s.content}>
  <View style={s.header}><View><Text style={s.kicker}>SEU TREINO. SEU RITMO.</Text><Text style={s.title}>Riva <Text style={{color:green}}>Run</Text></Text></View><View style={s.avatar}><Ionicons name="person-outline" size={22} color={green}/></View></View>
  <View style={s.hero}><View style={s.heroTop}><View style={s.dot}/><Text style={s.eyebrow}>RESUMO DA SEMANA</Text></View><Text style={s.km}>24,8 <Text style={s.unit}>km</Text></Text><Text style={s.muted}>quilômetros registrados · dados demonstrativos</Text><View style={s.track}><View style={s.fill}/></View><View style={s.between}><Text style={s.muted}>Meta semanal: 30 km</Text><Text style={s.greenText}>83%</Text></View></View>
  <View style={s.metrics}><Metric label="PONTOS" value="180"/><Metric label="CORRIDAS" value="4"/><Metric label="TÊNIS" value="2/5"/></View>
  <View style={s.between}><Text style={s.section}>Desafio em destaque</Text><Text style={s.greenText}>SEMANAL</Text></View>
  <View style={s.card}><View style={s.icon}><Ionicons name="flash-outline" size={22} color={green}/></View><View style={{flex:1}}><Text style={s.cardTitle}>Semana em movimento</Text><Text style={s.muted}>Meta de 30 km · termina domingo</Text><View style={s.track}><View style={s.fill}/></View></View></View>
  <Text style={s.section}>Conecte seu relógio</Text>
  <View style={s.card}><View style={s.icon}><Ionicons name="sync-outline" size={22} color={green}/></View><View style={{flex:1}}><Text style={s.cardTitle}>Strava</Text><Text style={s.muted}>Primeira integração planejada. A conexão ainda não está ativa.</Text></View></View>
  <View style={s.card}><View style={s.icon}><Ionicons name="watch-outline" size={22} color={green}/></View><View style={{flex:1}}><Text style={s.cardTitle}>Garmin e Amazfit</Text><Text style={s.muted}>Integrações oficiais serão avaliadas.</Text></View></View>
  <Text style={s.footnote}>Protótipo visual · nenhuma atividade real foi importada.</Text>
 </ScrollView>;
}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#0B1014"},content:{padding:20,paddingTop:24,paddingBottom:32,gap:17},
 header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:3},kicker:{color:muted,fontSize:10,fontWeight:"800",letterSpacing:2},title:{color:"#F5F8FA",fontSize:32,fontWeight:"900",marginTop:4},avatar:{width:44,height:44,borderRadius:15,backgroundColor:card,borderWidth:1,borderColor:line,alignItems:"center",justifyContent:"center"},
 hero:{backgroundColor:"#1A272B",borderColor:"#34443B",borderWidth:1,borderRadius:24,padding:20},heroTop:{flexDirection:"row",alignItems:"center",gap:8},dot:{width:7,height:7,borderRadius:4,backgroundColor:green},eyebrow:{color:"#C3D0C7",fontSize:10,fontWeight:"800",letterSpacing:1.5},km:{color:"#F7FAF5",fontSize:48,fontWeight:"900",marginTop:10},unit:{fontSize:20,color:green},muted:{color:muted,fontSize:11,lineHeight:17},track:{height:6,borderRadius:8,backgroundColor:"#303D44",overflow:"hidden",marginTop:13},fill:{width:"83%",height:"100%",backgroundColor:green,borderRadius:8},between:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:9},greenText:{color:green,fontSize:11,fontWeight:"900"},
 metrics:{flexDirection:"row",backgroundColor:card,borderColor:line,borderWidth:1,borderRadius:18,paddingVertical:15},metric:{flex:1,paddingHorizontal:10,borderRightWidth:1,borderRightColor:line,gap:8},metricLabel:{color:muted,fontSize:9,fontWeight:"800",letterSpacing:1},metricValue:{color:"#F5F8FA",fontSize:22,fontWeight:"900"},
 section:{color:"#F5F8FA",fontSize:16,fontWeight:"800"},card:{flexDirection:"row",alignItems:"center",gap:12,padding:15,backgroundColor:card,borderRadius:18,borderWidth:1,borderColor:line},icon:{width:42,height:42,borderRadius:13,backgroundColor:"#263522",alignItems:"center",justifyContent:"center"},cardTitle:{color:"#F5F8FA",fontSize:13,fontWeight:"800",marginBottom:4},footnote:{color:"#65737C",fontSize:10,textAlign:"center"}
});
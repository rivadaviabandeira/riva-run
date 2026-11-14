import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const green = "#B8F34A";
const muted = "#93A1AA";
const whatsappNumber = process.env.EXPO_PUBLIC_STORE_WHATSAPP ?? "";

const products = [
  { id:"ph-performance", name:"Meia Performance", origin:"MARCA PRÓPRIA", detail:"Modelo demonstrativo · corrida e treino", price:"A definir", color:"#263522", icon:"fitness-outline" as const },
  { id:"partner-run", name:"Meia de Corrida Parceira", origin:"REVENDA", detail:"Produto demonstrativo · marca parceira", price:"A definir", color:"#202E3B", icon:"ribbon-outline" as const },
];

async function contact(productName:string) {
  if (!whatsappNumber) {
    Alert.alert("WhatsApp em configuração", "O catálogo está em fase inicial. O número comercial será configurado antes da publicação.");
    return;
  }
  const message = encodeURIComponent("Olá! Tenho interesse no produto " + productName + " da PaceHub Store. Pode me informar tamanhos, cores e disponibilidade?");
  const url = "https://wa.me/" + whatsappNumber.replace(/\\D/g, "") + "?text=" + message;
  try { await Linking.openURL(url); }
  catch { Alert.alert("Não foi possível abrir o WhatsApp", "Verifique se o WhatsApp está instalado ou tente novamente."); }
}

export default function StoreScreen() {
  return <ScrollView style={s.screen} contentContainerStyle={s.content}>
    <Text style={s.kicker}>EQUIPAMENTO PARA IR MAIS LONGE</Text>
    <Text style={s.title}>PaceHub <Text style={{color:green}}>Store</Text></Text>
    <Text style={s.subtitle}>Produtos selecionados para acompanhar seus treinos e corridas.</Text>
    <View style={s.banner}>
      <View style={{flex:1,gap:7}}>
        <Text style={s.bannerTag}>VITRINE DO CORREDOR</Text>
        <Text style={s.bannerTitle}>Conforto em cada quilômetro.</Text>
        <Text style={s.bannerText}>Conheça nossa seleção de meias de corrida.</Text>
      </View>
      <Ionicons name="footsteps-outline" size={52} color={green}/>
    </View>
    <View style={s.sectionRow}><Text style={s.section}>Meias de corrida</Text><Text style={s.count}>2 produtos demonstrativos</Text></View>
    {products.map(p=><View key={p.id} style={s.product}>
      <View style={[s.productVisual,{backgroundColor:p.color}]}>
        <Ionicons name={p.icon} size={48} color={green}/>
        <Text style={s.visualCaption}>PACEHUB STORE</Text>
      </View>
      <View style={s.productInfo}>
        <Text style={s.origin}>{p.origin}</Text>
        <Text style={s.productName}>{p.name}</Text>
        <Text style={s.detail}>{p.detail}</Text>
        <View style={s.buyRow}><Text style={s.price}>{p.price}</Text><TouchableOpacity style={s.button} onPress={()=>contact(p.name)}><Ionicons name="logo-whatsapp" size={16} color="#10170A"/><Text style={s.buttonText}>Consultar</Text></TouchableOpacity></View>
      </View>
    </View>)}
    <View style={s.notice}><Ionicons name="information-circle-outline" size={18} color={green}/><Text style={s.noticeText}>Este catálogo é demonstrativo. Fotos comerciais, preços, tamanhos, cores, estoque e número de atendimento serão cadastrados na etapa de administração.</Text></View>
    <Text style={s.footer}>PACEHUB · CORRA NO SEU RITMO</Text>
  </ScrollView>;
}

const s=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#0B1014"},content:{padding:20,paddingTop:28,paddingBottom:34,gap:15},
  kicker:{color:muted,fontSize:10,fontWeight:"900",letterSpacing:1.8},title:{color:"#F5F8FA",fontSize:30,fontWeight:"900",marginTop:-8},subtitle:{color:muted,fontSize:12,lineHeight:19,marginTop:-8},
  banner:{backgroundColor:"#1A272B",borderColor:"#34443B",borderWidth:1,borderRadius:20,padding:18,flexDirection:"row",alignItems:"center",gap:10},bannerTag:{color:green,fontSize:9,fontWeight:"900",letterSpacing:1.3},bannerTitle:{color:"#F5F8FA",fontSize:20,fontWeight:"900",lineHeight:25},bannerText:{color:"#B6C3C9",fontSize:11,lineHeight:16},
  sectionRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:4},section:{color:"#F5F8FA",fontSize:16,fontWeight:"900"},count:{color:muted,fontSize:9},
  product:{backgroundColor:"#131C22",borderColor:"#26333B",borderWidth:1,borderRadius:19,overflow:"hidden"},productVisual:{height:125,alignItems:"center",justifyContent:"center",gap:6},visualCaption:{color:"#C5D0D5",fontSize:8,fontWeight:"900",letterSpacing:2},productInfo:{padding:15,gap:6},origin:{color:green,fontSize:9,fontWeight:"900",letterSpacing:1.2},productName:{color:"#F5F8FA",fontSize:16,fontWeight:"900"},detail:{color:muted,fontSize:11},buyRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:7},price:{color:"#F5F8FA",fontSize:13,fontWeight:"800"},button:{backgroundColor:green,borderRadius:12,paddingHorizontal:13,paddingVertical:10,flexDirection:"row",alignItems:"center",gap:7},buttonText:{color:"#10170A",fontSize:11,fontWeight:"900"},
  notice:{flexDirection:"row",alignItems:"flex-start",gap:9,backgroundColor:"#17221F",borderRadius:13,padding:13},noticeText:{flex:1,color:"#AAB7B0",fontSize:10,lineHeight:15},footer:{color:"#65737C",fontSize:9,textAlign:"center",letterSpacing:1.5,marginTop:5}
});
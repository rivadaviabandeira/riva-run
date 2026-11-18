import { Alert, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ActionButton,
  Card,
  IconBadge,
  Kicker,
  Muted,
  Screen,
  SectionTitle,
  Tag,
  palette,
} from "../../components/ui";
import { useData } from "../../lib/data/provider";
import {
  MAX_DISCOUNT_RATE,
  PP_VALUE_BRL,
  formatBRL,
  formatDecimal,
  formatShortDate,
} from "../../lib/domain";

export default function StoreScreen() {
  const { rewards, products, redemptions, purchases, stats, discountFor, actions } = useData();

  // Com backend configurado a chamada vai para a RPC do Postgres (003); no modo
  // demonstração a mesma regra roda localmente.
  const redeem = async (rewardId: string) => {
    const result = await actions.redeemReward(rewardId);
    Alert.alert(result.ok ? "Resgate confirmado" : "Resgate não realizado", result.message);
  };

  const buy = async (productId: string) => {
    const result = await actions.buyProduct(productId);
    Alert.alert(result.ok ? "Pedido registrado" : "Pedido não realizado", result.message);
  };

  return (
    <Screen>
      <Kicker>EQUIPAMENTO E RECOMPENSAS</Kicker>
      <Text style={styles.title}>
        Pace<Text style={{ color: palette.green }}>Store</Text>
      </Text>
      <Muted>
        Use seus PP para resgatar benefícios ou abater até {Math.round(MAX_DISCOUNT_RATE * 100)}% no
        valor de produtos.
      </Muted>

      <Card style={styles.balance}>
        <View style={{ flex: 1 }}>
          <Text style={styles.balanceLabel}>SALDO DISPONÍVEL</Text>
          <Text style={styles.balanceValue}>
            {formatDecimal(stats.balancePP)} <Text style={styles.balanceUnit}>PP</Text>
          </Text>
          <Muted>1 PP = {formatBRL(PP_VALUE_BRL)} de desconto · {formatDecimal(stats.spentPP)} PP já utilizados</Muted>
        </View>
        <Ionicons name="wallet-outline" size={30} color={palette.green} />
      </Card>

      <SectionTitle right={<Text style={styles.count}>{rewards.length} resgates</Text>}>
        Resgatar com PP
      </SectionTitle>
      {rewards.map((reward) => {
        const affordable = stats.balancePP >= reward.costPP;
        return (
          <Card key={reward.id}>
            <View style={styles.row}>
              <IconBadge icon={reward.icon} color={affordable ? palette.green : palette.faint} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{reward.name}</Text>
                <Muted>{reward.description}</Muted>
              </View>
              <Tag label={`${reward.costPP} PP`} color={affordable ? palette.green : palette.muted} />
            </View>
            <ActionButton
              label={affordable ? "Resgatar" : `Faltam ${formatDecimal(reward.costPP - stats.balancePP)} PP`}
              icon="gift-outline"
              onPress={() => redeem(reward.id)}
              disabled={!affordable}
            />
          </Card>
        );
      })}

      <SectionTitle right={<Text style={styles.count}>{products.length} produtos</Text>}>
        Produtos com desconto
      </SectionTitle>
      {products.map((product) => {
        const discount = discountFor(product.priceBRL);
        return (
          <Card key={product.id} style={styles.product}>
            <View style={[styles.visual, { backgroundColor: product.tint }]}>
              <Ionicons name={product.icon} size={42} color={palette.green} />
              <Text style={styles.visualCaption}>PACEHUB STORE</Text>
            </View>
            <View style={styles.productBody}>
              <Text style={styles.origin}>{product.origin}</Text>
              <Text style={styles.name}>{product.name}</Text>
              <Muted>{product.detail}</Muted>
              <View style={styles.priceRow}>
                <View>
                  <Text style={styles.oldPrice}>{formatBRL(product.priceBRL)}</Text>
                  <Text style={styles.price}>{formatBRL(discount.finalPriceBRL)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.discount}>
                    -{formatBRL(discount.discountBRL)} ({formatDecimal(discount.ppUsed)} PP)
                  </Text>
                  <Text style={styles.cap}>máx. {formatDecimal(discount.maxPP)} PP</Text>
                </View>
              </View>
              <ActionButton
                label={discount.ppUsed > 0 ? "Comprar com desconto" : "Comprar sem desconto"}
                icon="logo-whatsapp"
                onPress={() => buy(product.id)}
              />
            </View>
          </Card>
        );
      })}

      <Card style={styles.notice}>
        <Ionicons name="information-circle-outline" size={18} color={palette.green} />
        <Muted>
          Pedidos são concluídos pelo WhatsApp com a equipe PaceHub. O desconto em PP é aplicado no
          atendimento e o valor final é sempre limitado a {Math.round(MAX_DISCOUNT_RATE * 100)}% do
          produto.
        </Muted>
      </Card>

      {redemptions.length + purchases.length > 0 ? (
        <>
          <SectionTitle>Seus últimos resgates</SectionTitle>
          {redemptions.map((redemption) => (
            <Card key={redemption.id} style={styles.historyRow}>
              <Text style={styles.name}>{redemption.name}</Text>
              <Text style={styles.historyMeta}>
                {formatShortDate(redemption.createdAt)} · -{formatDecimal(redemption.costPP)} PP
              </Text>
            </Card>
          ))}
          {purchases.map((purchase) => (
            <Card key={purchase.id} style={styles.historyRow}>
              <Text style={styles.name}>
                {products.find((product) => product.id === purchase.productId)?.name ?? "Produto"}
              </Text>
              <Text style={styles.historyMeta}>
                {formatShortDate(purchase.createdAt)} · {formatBRL(purchase.paidBRL)} · -
                {formatDecimal(purchase.ppUsed)} PP
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      <Text style={styles.footer}>PACEHUB · CORRA NO SEU RITMO</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.text, fontSize: 30, fontWeight: "900", marginTop: -6 },
  balance: { flexDirection: "row", alignItems: "center", backgroundColor: palette.cardAlt, borderColor: palette.lineStrong },
  balanceLabel: { color: "#C3D0C7", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  balanceValue: { color: palette.text, fontSize: 32, fontWeight: "900", marginVertical: 2 },
  balanceUnit: { fontSize: 15, color: palette.green },
  count: { color: palette.muted, fontSize: 9 },
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  name: { color: palette.text, fontSize: 14, fontWeight: "900" },
  product: { padding: 0, overflow: "hidden" },
  visual: { height: 110, alignItems: "center", justifyContent: "center", gap: 4 },
  visualCaption: { color: "#C5D0D5", fontSize: 8, fontWeight: "900", letterSpacing: 2 },
  productBody: { padding: 14, gap: 7 },
  origin: { color: palette.green, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 2 },
  oldPrice: { color: palette.faint, fontSize: 10, textDecorationLine: "line-through" },
  price: { color: palette.text, fontSize: 17, fontWeight: "900" },
  discount: { color: palette.green, fontSize: 10, fontWeight: "900" },
  cap: { color: palette.faint, fontSize: 9 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#17221F", borderColor: "#2A3B33" },
  historyRow: { gap: 3, paddingVertical: 12 },
  historyMeta: { color: palette.muted, fontSize: 10 },
  footer: { color: palette.faint, fontSize: 9, textAlign: "center", letterSpacing: 1.5, marginTop: 4 },
});

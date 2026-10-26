import { useRouter } from "expo-router";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, typography } from "../constants/theme";
import Screen from "../components/Screen";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brandName}>AutoGuard AI</Text>
        <MaterialCommunityIcons
          name="shield-outline"
          size={24}
          color={colors.primary}
        />
      </View>

      {/* Hero Content */}
      <View style={styles.hero}>
        {/* Logo - the badge's own background is transparent (see
            assets/images/logo.png) and matches colors.background exactly,
            so it sits directly on the screen with no extra wrapper. */}
        <Image source={require("../../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />

        {/* Headline - short slogan */}
        <Text style={styles.headline}>Know Before You Go.</Text>

        {/* Subtext - longer, explains what the app actually does */}
        <Text style={styles.subtext}>
          Record. Diagnose. Understand — before you ever visit a shop.
        </Text>

        {/* CTA */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.btnPrimary}
            activeOpacity={0.85}
            onPress={() => router.push("/auth" as any)}
          >
            <Text style={styles.btnPrimaryText}>Get Started</Text>
            <MaterialCommunityIcons
              name="arrow-right"
              size={20}
              color={colors.onPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background},

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    height: 64},
  brandName: {
    ...typography.headlineMd,
    color: colors.primary},

  // Hero
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl},

  // Logo
  logo: {
    width: 240,
    height: 240,
    marginBottom: spacing.base},

  // Headline
  headline: {
    ...typography.headlineLgMobile,
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.base},

  // Subtext
  subtext: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 320,
    marginBottom: spacing.xxxl},

  // Actions
  actions: {
    width: "100%",
    alignItems: "center",
    gap: spacing.base},
  btnPrimary: {
    width: "100%",
    height: 56,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4},
  btnPrimaryText: {
    ...typography.labelStatus,
    color: colors.onPrimary}});
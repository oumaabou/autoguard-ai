import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "../constants/theme";
import BottomNav from "../components/BottomNav";
import TopBar from "../components/TopBar";
import Screen from "../components/Screen";
import OnboardingGuide from "../components/OnboardingGuide";
import { recordAndClassify } from "../lib/ml/classify";
import { useProfile } from "../lib/profile";
import { useTranslation } from "../lib/i18n";

export default function DashboardScreen() {
  const router = useRouter();
  const { profile, completeOnboarding } = useProfile();
  const { t } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.15)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isListening) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 1.4, duration: 800, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.15, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseScale.setValue(1);
      pulseOpacity.setValue(0.15);
    }
    return () => pulseLoop.current?.stop();
  }, [isListening]);

  const handleListen = async () => {
    if (isListening) return; // recording is already in progress, ignore repeat taps

    setIsListening(true);
    try {
      const result = await recordAndClassify();
      router.push({
        pathname: "/diagnostic" as any,
        params: {
          label: result.label,
          confidence: String(result.confidence),
          windowsAnalyzed: String(result.windowsAnalyzed),
          // "0"/"1" rather than a real boolean - useLocalSearchParams only
          // ever gives back strings/string[] regardless of what's passed in.
          confident: result.isConfident ? "1" : "0",
        },
      });
    } catch (err) {
      Alert.alert(
        t("dashboard.listeningFailedTitle"),
        err instanceof Error ? err.message : t("dashboard.listeningFailedMessage")
      );
    } finally {
      setIsListening(false);
    }
  };

  return (
    <Screen>
      <TopBar title="AutoGuard AI" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Start Guide */}
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>{t("dashboard.quickStartTitle")}</Text>
          {[
            t("dashboard.step1"),
            t("dashboard.step2"),
            t("dashboard.step3"),
          ].map((step, i) => (
            <View key={i} style={styles.guideStep}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Mic Button */}
        <View style={styles.micSection}>
          {/* Pulse ring — same size as button, absolutely centered */}
          <View style={styles.micBtnWrap}>
            <Animated.View
              style={[
                styles.pulseRing,
                { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
              ]}
            />
            <TouchableOpacity
              style={[styles.micBtn, isListening && styles.micBtnActive]}
              activeOpacity={0.85}
              onPress={handleListen}
            >
              <MaterialCommunityIcons
                name={isListening ? "waveform" : "microphone"}
                size={64}
                color={colors.onPrimary}
              />
              <Text style={styles.micLabel}>
                {isListening ? t("dashboard.listening") : t("dashboard.startListening")}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.micHint}>
            {t("dashboard.micHint")}
          </Text>
        </View>

        {/* Daily Tip */}
        <View style={styles.tipCard}>
          <MaterialCommunityIcons
            name="lightbulb-outline"
            size={22}
            color={colors.primary}
            style={{ marginTop: 2 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>{t("dashboard.dailyTipTitle")}</Text>
            <Text style={styles.tipBody}>
              {t("dashboard.dailyTipBody")}
            </Text>
          </View>
        </View>
      </ScrollView>
      <BottomNav active="Home" />
      <OnboardingGuide visible={profile !== null && !profile.hasCompletedOnboarding} onDone={completeOnboarding} />
    </Screen>
  );
}

const MIC_SIZE = 192;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.xxl,
    gap: spacing.base + 4,
  },
  guideCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.xl,
    padding: spacing.base,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    gap: 12,
  },
  guideTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.primary,
  },
  guideStep: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  stepNumber: { fontSize: 12, fontWeight: "700", color: colors.onPrimary },
  stepText: { flex: 1, fontSize: 16, color: colors.onSurface, lineHeight: 24 },

  micSection: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.xl,
  },
  // Wrapper gives the pulse ring a fixed bounding box to anchor inside
  micBtnWrap: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    backgroundColor: colors.primary,
  },
  micBtn: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  micBtnActive: { backgroundColor: colors.secondaryContainer },
  micLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: colors.onPrimary,
    textTransform: "uppercase",
  },
  micHint: {
    fontSize: 15,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 22,
  },

  tipCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    padding: spacing.base,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    elevation: 2,
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.primary,
    marginBottom: 4,
  },
  tipBody: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 22 },
});

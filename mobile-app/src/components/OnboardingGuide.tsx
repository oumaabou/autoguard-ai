/**
 * OnboardingGuide.tsx
 * ====================
 * One-time post-signup walkthrough explaining the app's actual flow: Home
 * (record + diagnose) -> the diagnosis result (save it / chat about it) ->
 * History -> Evaluator -> Profile. Shown from DashboardScreen when
 * profile.hasCompletedOnboarding is false (new accounts only - see the
 * profiles_unique_username_and_onboarding_flag migration, which backfills
 * existing accounts to true so they never see this retroactively).
 *
 * Dismissing (Skip or finishing the last step) calls useProfile()'s
 * completeOnboarding(), which persists the flag so it never shows again.
 */

import { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, typography } from "../constants/theme";

interface Step {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: "microphone",
    title: "Home: Listen",
    body: "Tap \"Start Listening\" and hold your phone near the engine. AutoGuard's on-device AI analyzes the sound and flags any issue in seconds.",
  },
  {
    icon: "shield-check-outline",
    title: "Your diagnosis",
    body: "See what was found and how urgent it is. From there, tap \"Save to History\" to keep it, or \"Talk to Advocacy Bot\" to ask questions about it.",
  },
  {
    icon: "history",
    title: "History",
    body: "Every diagnosis you save lives here - color-coded by urgency (red/yellow/green), with its price range and any chat you had about it.",
  },
  {
    icon: "chart-bar",
    title: "Evaluator",
    body: "Shows a fair repair-price range for your most recent diagnosis, in your chosen currency, so you know what a shop should be charging.",
  },
  {
    icon: "account-circle-outline",
    title: "Profile",
    body: "Set your vehicle's powertrain, your preferred currency, your username, and a photo - all used across the app.",
  },
];

export default function OnboardingGuide({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const handleClose = () => {
    setStep(0);
    onDone();
  };

  const handleNext = () => {
    if (isLast) {
      handleClose();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.skipBtn} onPress={handleClose} activeOpacity={0.7}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name={current.icon} size={32} color={colors.primary} />
          </View>

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          <TouchableOpacity style={styles.nextBtn} activeOpacity={0.85} onPress={handleNext}>
            <Text style={styles.nextBtnText}>{isLast ? "Get Started" : "Next"}</Text>
            {!isLast && <MaterialCommunityIcons name="arrow-right" size={18} color={colors.onPrimary} />}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 360, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl + 4, padding: spacing.xl, alignItems: "center", elevation: 8 },
  skipBtn: { alignSelf: "flex-end", padding: 4, marginBottom: spacing.sm },
  skipText: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceVariant },
  iconWrap: { width: 64, height: 64, borderRadius: radius.lg + 4, backgroundColor: colors.primaryFixed, alignItems: "center", justifyContent: "center", marginBottom: spacing.base },
  title: { ...typography.headlineMd, color: colors.onSurface, marginBottom: spacing.sm, textAlign: "center" },
  body: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 22, textAlign: "center", marginBottom: spacing.lg },
  dots: { flexDirection: "row", gap: 6, marginBottom: spacing.lg },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.outlineVariant },
  dotActive: { backgroundColor: colors.primary, width: 20 },
  nextBtn: { width: "100%", height: 52, backgroundColor: colors.primary, borderRadius: radius.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  nextBtnText: { fontSize: 16, fontWeight: "700", color: colors.onPrimary },
});

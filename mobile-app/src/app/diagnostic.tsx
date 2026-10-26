import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { colors, spacing, radius, typography } from "../constants/theme";
import Screen from "../components/Screen";
import BottomNav from "../components/BottomNav";
import TopBar from "../components/TopBar";
import { FAULT_INFO, SEVERITY_COLOR, type FaultLabel } from "../constants/faults";
import { useProfile } from "../lib/profile";
import { getFaultKnowledge, ApiError } from "../lib/api";
import { createConversation } from "../lib/chatHistory";
import { useTranslation } from "../lib/i18n";

const CIRCLE_SIZE = 76;
const STROKE = 8;

export default function DiagnosticScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    label?: string;
    confidence?: string;
    windowsAnalyzed?: string;
    confident?: string;
  }>();

  // Fall back to a safe default if this screen is somehow opened without
  // params (e.g. deep link) so it never crashes on a missing lookup.
  const label = (params.label as FaultLabel) in FAULT_INFO ? (params.label as FaultLabel) : "healthy";
  // Display-only cap - never show absolute certainty to the user, even
  // when the underlying (INT8-quantized, uncalibrated softmax) value
  // rounds up to 100%. Doesn't touch the raw confidence used for saving to
  // History or the isConfident gating in classify.ts - just what's shown
  // here. See the "why does it ever say 100%" discussion for the root
  // cause (quantization ceiling + no calibration step in training).
  const DISPLAY_CONFIDENCE_CAP = 87;
  const confidence = params.confidence
    ? Math.min(DISPLAY_CONFIDENCE_CAP, Math.round(parseFloat(params.confidence) * 100))
    : null;
  const windowsAnalyzed = params.windowsAnalyzed ? parseInt(params.windowsAnalyzed, 10) : null;
  // Defaults to true (old behavior) if the param is ever missing entirely,
  // e.g. a raw deep link with no `confident` param - only an explicit "0"
  // (set by dashboard.tsx when classify.ts's isConfident comes back false)
  // triggers the uncertain-reading state below. See lib/ml/classify.ts's
  // CONFIDENCE_THRESHOLD/AGREEMENT_THRESHOLD for how that's decided.
  const isConfident = params.confident !== "0";

  const info = FAULT_INFO[label];
  const severityColor = SEVERITY_COLOR[info.severity];
  const { powertrain } = useProfile();
  const { t } = useTranslation();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Shared between "Save to History" and "Talk to Advocacy Bot" so both
  // land on the SAME saved record - one diagnosis = one History entry,
  // whether or not a chat discussion ever gets attached to it.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const rawConfidence = params.confidence ? parseFloat(params.confidence) : null;

  // Creates the diagnosis-card record the first time it's needed (Save or
  // Talk-to-Bot, whichever happens first) and reuses it after that.
  // Deliberately Gemini-free - only a Supabase price lookup - so a Gemini
  // outage can never block saving a diagnosis.
  const ensureConversationId = async (): Promise<string> => {
    if (conversationId) return conversationId;
    const knowledge = await getFaultKnowledge(label).catch(() => null);
    const convo = await createConversation({
      faultType: label,
      confidence: rawConfidence,
      powertrain,
      title: info.title,
      severity: info.severity,
      costLow: knowledge?.typical_cost_low ?? null,
      costHigh: knowledge?.typical_cost_high ?? null,
      messages: [],
    });
    setConversationId(convo.id);
    return convo.id;
  };

  const handleSaveToHistory = async () => {
    if (saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    setSaveError(null);
    try {
      await ensureConversationId();
      setSaveState("saved");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("diagnostic.saveError"));
      setSaveState("error");
    }
  };

  const handleTalkToBot = async () => {
    // Don't block navigation on this - if it fails (e.g. offline), advocacy
    // still works fine as an unsaved chat, same as before this record-
    // sharing was added.
    const id = await ensureConversationId().catch(() => null);
    router.push({
      pathname: "/advocacy",
      params: id
        ? { conversationId: id }
        : { faultType: label, ...(params.confidence ? { confidence: params.confidence } : {}) },
    } as any);
  };

  return (
    <Screen>
      <TopBar title="AutoGuard AI" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!isConfident && (
          <View style={styles.uncertainCard}>
            <View style={styles.uncertainHeader}>
              <MaterialCommunityIcons name="help-circle-outline" size={22} color={colors.tertiaryFixedDim} />
              <Text style={styles.uncertainTitle}>{t("diagnostic.uncertainTitle")}</Text>
            </View>
            <Text style={styles.uncertainBody}>{t("diagnostic.uncertainBody")}</Text>
            <TouchableOpacity style={styles.uncertainRetryBtn} activeOpacity={0.85} onPress={() => router.back()}>
              <MaterialCommunityIcons name="microphone" size={18} color={colors.onPrimary} />
              <Text style={styles.uncertainRetryText}>{t("diagnostic.recordAgain")}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.detectionSection}>
          <Text style={styles.eyebrow}>{isConfident ? t("diagnostic.detectionType") : t("diagnostic.bestGuessLabel")}</Text>
          <Text style={styles.detectionTitle}>{info.title}</Text>
        </View>

        <View style={styles.severityCard}>
          <View style={[styles.severityRedBar, { backgroundColor: severityColor }]} />
          <View style={styles.severityInner}>
            <MaterialCommunityIcons name={info.icon} size={32} color={severityColor} style={{ marginTop: 2, flexShrink: 0 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.severityTitle, { color: severityColor }]}>{info.severityHeadline}</Text>
              <Text style={styles.severityBody}>{info.summary}</Text>
            </View>
          </View>
        </View>

        {confidence !== null && (
          <View style={styles.card}>
            <View style={styles.confidenceHeader}>
              <Text style={styles.eyebrow}>{t("diagnostic.confidenceLabel")}</Text>
              <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>{t("diagnostic.verifiedByAi")}</Text></View>
            </View>
            <View style={styles.confidenceRow}>
              <View style={styles.circleContainer}>
                <View style={styles.circleOuter} />
                <View style={styles.circleHalf1} />
                <View style={styles.circleHalf2} />
                <View style={styles.circleOverlay}>
                  <Text style={styles.circlePercent}>{confidence}%</Text>
                </View>
              </View>
              <Text style={styles.confidenceDesc}>{info.summary}</Text>
            </View>
            <Text style={styles.confidenceNote}>
              {windowsAnalyzed
                ? t("diagnostic.analyzedAcrossSamples", { n: windowsAnalyzed })
                : t("diagnostic.onDeviceAnalysis")}
            </Text>
          </View>
        )}

        <View style={styles.flagCard}>
          <View style={styles.flagHeader}>
            <MaterialCommunityIcons name="chart-bar" size={20} color={colors.primary} />
            <Text style={styles.flagTitle}>{t("diagnostic.whyFlagged")}</Text>
          </View>
          {info.whyFlagged.map((text, i) => (
            <View key={i} style={styles.flagItem}>
              <MaterialCommunityIcons name="waveform" size={22} color={colors.primary} style={{ marginTop: 2, flexShrink: 0 }} />
              <Text style={styles.flagText}>{text}</Text>
            </View>
          ))}
          <View style={styles.flagItem}>
            <MaterialCommunityIcons name="wrench-outline" size={22} color={colors.primary} style={{ marginTop: 2, flexShrink: 0 }} />
            <Text style={styles.flagText}>{info.recommendedAction}</Text>
          </View>
        </View>

        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.btnPrimary}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: "/evaluator", params: { faultType: label } } as any)}
          >
            <MaterialCommunityIcons name="cash-multiple" size={22} color={colors.onPrimary} />
            <Text style={styles.btnPrimaryText}>{t("diagnostic.checkFairPrice")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnOutline}
            activeOpacity={0.85}
            onPress={handleTalkToBot}
          >
            <MaterialCommunityIcons name="robot-outline" size={22} color={colors.primary} />
            <Text style={styles.btnOutlineText}>{t("diagnostic.talkToBot")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} activeOpacity={0.7} onPress={handleSaveToHistory} disabled={saveState === "saving"}>
            {saveState === "saving" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialCommunityIcons
                name={saveState === "saved" ? "bookmark-check" : saveState === "error" ? "bookmark-remove-outline" : "bookmark-outline"}
                size={20}
                color={saveState === "error" ? colors.error : colors.primary}
              />
            )}
            <Text style={[styles.btnGhostText, saveState === "error" && { color: colors.error }]}>
              {saveState === "saving" ? t("diagnostic.saving") : saveState === "saved" ? t("diagnostic.savedToHistory") : saveState === "error" ? (saveError ?? t("diagnostic.saveError")) : t("diagnostic.saveToHistory")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <BottomNav active="Evaluator" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl, gap: spacing.base },
  uncertainCard: { backgroundColor: colors.tertiaryFixed + "40", borderRadius: radius.xl, borderWidth: 1, borderColor: colors.tertiaryFixedDim, padding: spacing.base, gap: spacing.sm },
  uncertainHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  uncertainTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  uncertainBody: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  uncertainRetryBtn: { height: 48, backgroundColor: colors.tertiaryFixedDim, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 },
  uncertainRetryText: { fontSize: 15, fontWeight: "700", color: colors.onPrimary },
  detectionSection: { marginBottom: 4 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: colors.onSurfaceVariant, marginBottom: 2 },
  detectionTitle: { ...typography.headlineLgMobile, color: colors.primary },
  severityCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, borderWidth: 0.5, borderColor: colors.outlineVariant, flexDirection: "row", overflow: "hidden", elevation: 3 },
  severityRedBar: { width: 8, backgroundColor: colors.secondary },
  severityInner: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 12, padding: spacing.base },
  severityTitle: { fontSize: 16, fontWeight: "600", color: colors.secondary, marginBottom: 4 },
  severityBody: { fontSize: 15, color: colors.onSurface, lineHeight: 22 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, borderWidth: 0.5, borderColor: colors.outlineVariant, padding: spacing.base, elevation: 3 },
  confidenceHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.base },
  aiBadge: { backgroundColor: colors.tertiaryFixed, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  aiBadgeText: { fontSize: 12, fontWeight: "700", color: colors.onTertiaryFixedVariant },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: spacing.sm },
  circleContainer: { width: CIRCLE_SIZE, height: CIRCLE_SIZE, position: "relative", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  circleOuter: { width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2, borderWidth: STROKE, borderColor: colors.surfaceContainerHigh, position: "absolute" },
  circleHalf1: { position: "absolute", width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2, borderWidth: STROKE, borderColor: colors.primaryContainer, borderRightColor: "transparent", borderBottomColor: "transparent", transform: [{ rotate: "-90deg" }] },
  circleHalf2: { position: "absolute", width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2, borderWidth: STROKE, borderColor: colors.primaryContainer, borderLeftColor: "transparent", borderTopColor: "transparent", transform: [{ rotate: "-90deg" }] },
  circleOverlay: { position: "absolute", width: CIRCLE_SIZE - STROKE * 2, height: CIRCLE_SIZE - STROKE * 2, borderRadius: (CIRCLE_SIZE - STROKE * 2) / 2, backgroundColor: colors.surfaceContainerLowest, alignItems: "center", justifyContent: "center" },
  circlePercent: { fontSize: 15, fontWeight: "700", color: colors.primary },
  confidenceDesc: { flex: 1, fontSize: 15, color: colors.onSurface, lineHeight: 22 },
  confidenceNote: { fontSize: 13, color: colors.onSurfaceVariant, fontStyle: "italic" },
  flagCard: { backgroundColor: colors.surfaceContainerLow, borderRadius: radius.xl, padding: spacing.base, gap: spacing.base },
  flagHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  flagTitle: { ...typography.labelStatus, color: colors.primary },
  flagItem: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  flagText: { flex: 1, fontSize: 15, color: colors.onSurface, lineHeight: 22 },
  actionsSection: { gap: 12, paddingVertical: 4 },
  btnPrimary: { height: 56, backgroundColor: colors.primary, borderRadius: radius.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, elevation: 5 },
  btnPrimaryText: { fontSize: 17, fontWeight: "700", color: colors.onPrimary },
  btnOutline: { height: 56, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, borderWidth: 2, borderColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  btnOutlineText: { fontSize: 16, fontWeight: "700", color: colors.primary },
  btnGhost: { paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md },
  btnGhostText: { fontSize: 16, fontWeight: "700", color: colors.primary }});

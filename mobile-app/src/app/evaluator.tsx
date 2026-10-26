import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { colors, spacing, radius, typography } from "../constants/theme";
import { getFaultKnowledge, ApiError, type FaultKnowledgeRow } from "../lib/api";
import { CURRENCIES, DEFAULT_CURRENCY, currencySymbol } from "../constants/currency";
import { useProfile } from "../lib/profile";
import { useExchangeRates } from "../lib/exchangeRates";
import { useTranslation } from "../lib/i18n";
import BottomNav from "../components/BottomNav";
import TopBar from "../components/TopBar";
import Screen from "../components/Screen";

// Currency is a persisted per-user setting (profiles.currency, see
// lib/profile.tsx) rather than something local to this screen - the picker
// below writes straight through setCurrency() so it stays in sync with the
// same value shown in Profile -> Preferences. The Gemini-free
// /fault-knowledge lookup returns figures as stored (no live currency
// conversion - the symbol is cosmetic only, same simplification the
// original mock data used).

function SimplePicker({ label, options, selected, onSelect }: {
  label: string; options: string[]; selected: string; onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <Text style={styles.pickerValue}>{selected}</Text>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={22} color={colors.onSurfaceVariant} />
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdown}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.dropdownItem, opt === selected && styles.dropdownItemActive]}
              onPress={() => { onSelect(opt); setOpen(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.dropdownText, opt === selected && styles.dropdownTextActive]}>{opt}</Text>
              {opt === selected && <MaterialCommunityIcons name="check" size={16} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function EvaluatorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ faultType?: string }>();
  const { profile, setCurrency } = useProfile();
  const { convert } = useExchangeRates();
  const { t } = useTranslation();
  const currentCurrency = CURRENCIES.find((c) => c.code === (profile?.currency ?? DEFAULT_CURRENCY)) ?? CURRENCIES[0];
  const [knowledge, setKnowledge] = useState<FaultKnowledgeRow | null>(null);
  const [isLoading, setIsLoading] = useState(!!params.faultType);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.faultType) return;
    setIsLoading(true);
    getFaultKnowledge(params.faultType)
      .then(setKnowledge)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load cost data."))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const symbol = currencySymbol(profile?.currency);
  const hasDiagnosis = !!knowledge;
  // fault_knowledge stores every cost figure in USD (see
  // knowledge_base/fault_knowledge.json) - convert() turns that into
  // whichever currency is selected using live rates from
  // lib/exchangeRates.tsx, so everything below (the bar scale, the stats
  // row) works in the already-converted currency.
  const currencyCode = profile?.currency ?? DEFAULT_CURRENCY;
  const minCost = convert(knowledge?.typical_cost_low ?? 0, currencyCode);
  const maxCost = convert(knowledge?.typical_cost_high ?? 0, currencyCode);
  const partName = knowledge?.title ?? t("evaluator.noIssue");

  // Bar scale adapts to the real cost range (fault types range from ~$230
  // wheel bearings to ~$3,000 turbo/traction-motor repairs) instead of a
  // fixed ceiling, with a sane floor for the empty/default state.
  const fairMaxScale = Math.max(500, maxCost * 1.25);
  const minPct = (minCost / fairMaxScale) * 100;
  const maxPct = (maxCost / fairMaxScale) * 100;
  const midPct = ((minCost + maxCost) / 2 / fairMaxScale) * 100;

  return (
    <Screen>
      <TopBar title="AutoGuard AI" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>{t("evaluator.title")}</Text>
          <Text style={styles.heroSub}>
            {hasDiagnosis ? t("evaluator.subDiagnosed") : t("evaluator.subNotDiagnosed")}
          </Text>
        </View>

        {/* Selectors */}
        <View style={styles.card}>
          <SimplePicker
            label={t("evaluator.currencyLabel")}
            options={CURRENCIES.map((c) => c.label)}
            selected={currentCurrency.label}
            onSelect={(label) => {
              const match = CURRENCIES.find((c) => c.label === label);
              if (match) setCurrency(match.code);
            }}
          />
        </View>

        {loadError && (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.errorBannerText}>{loadError}</Text>
          </View>
        )}

        {/* Result Card */}
        <View style={styles.resultCard}>
          <Text style={styles.partName}>{isLoading ? t("evaluator.loading") : partName}</Text>

          <View style={styles.priceDisplay}>
            {isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.priceRange, !hasDiagnosis && styles.priceRangeMuted]}>
                {symbol} {minCost} — {symbol} {maxCost}
              </Text>
            )}
            <Text style={styles.priceLabel}>
              {hasDiagnosis ? t("evaluator.estimatedRange") : t("evaluator.defaultsToZero")}
            </Text>
          </View>

          <View style={styles.barSection}>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.fairZone,
                  { left: `${minPct}%`, width: `${Math.max(maxPct - minPct, 0)}%` },
                ]}
              />
              {hasDiagnosis && <View style={[styles.midPointer, { left: `${midPct}%` }]} />}
            </View>
            <View style={styles.barLabels}>
              <Text style={styles.barLabelText}>{symbol} 0</Text>
              <Text style={styles.barLabelText}>{symbol} {Math.round(fairMaxScale)}+</Text>
            </View>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{symbol} {minCost}</Text>
            <Text style={styles.statLabel}>{t("evaluator.lowestPrice")}</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMid]}>
            <Text style={styles.statValue}>{symbol} {Math.round((minCost + maxCost) / 2)}</Text>
            <Text style={styles.statLabel}>{t("evaluator.marketAverage")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{symbol} {maxCost}</Text>
            <Text style={styles.statLabel}>{t("evaluator.highestPrice")}</Text>
          </View>
        </View>

        {/* CTA - only once there's an actual diagnosis to discuss; with
            nothing diagnosed yet there's no fault_type/context to hand the
            bot, so the button would just open an empty chat. */}
        {hasDiagnosis && (
          <TouchableOpacity
            style={styles.btnPrimary}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: "/advocacy", params: params.faultType ? { faultType: params.faultType } : {} } as any)}
          >
            <MaterialCommunityIcons name="robot-outline" size={22} color={colors.onPrimary} />
            <Text style={styles.btnPrimaryText}>{t("evaluator.talkToBot")}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <BottomNav active="Evaluator" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.xxl,
    gap: spacing.base,
  },

  heroSection: { marginBottom: 4 },
  heroTitle: { ...typography.headlineLgMobile, color: colors.primary },
  heroSub: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 22, marginTop: 6 },

  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 0.5,
    borderColor: colors.outlineVariant,
    padding: spacing.base,
    gap: spacing.base,
    elevation: 3,
  },

  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: colors.onSurfaceVariant },
  pickerBtn: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.outlineVariant, borderRadius: radius.lg, paddingHorizontal: spacing.base },
  pickerValue: { fontSize: 16, color: colors.onSurface },
  dropdown: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.outlineVariant, overflow: "hidden", marginTop: 2, elevation: 4 },
  dropdownItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.base, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.outlineVariant },
  dropdownItemActive: { backgroundColor: colors.primaryFixed + "33" },
  dropdownText: { fontSize: 15, color: colors.onSurface },
  dropdownTextActive: { color: colors.primary, fontWeight: "700" },

  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.error + "18", padding: spacing.sm + 2, borderRadius: radius.lg },
  errorBannerText: { flex: 1, fontSize: 13, color: colors.error, lineHeight: 18 },

  // Result card
  resultCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 0.5,
    borderColor: colors.outlineVariant,
    padding: spacing.base,
    gap: spacing.base,
    elevation: 3,
  },
  partName: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceVariant, textTransform: "uppercase", letterSpacing: 0.5 },

  priceDisplay: { alignItems: "center", paddingVertical: spacing.base },
  priceRange: { fontSize: 28, fontWeight: "800", color: colors.primary, letterSpacing: -0.5 },
  priceRangeMuted: { color: colors.onSurfaceVariant },
  priceLabel: { fontSize: 13, color: colors.onSurfaceVariant, marginTop: 4 },

  // Bar
  barSection: { gap: 6 },
  barTrack: { height: 20, backgroundColor: colors.surfaceContainer, borderRadius: radius.full, overflow: "visible", position: "relative" },
  fairZone: { position: "absolute", top: 0, bottom: 0, backgroundColor: colors.primaryContainer + "40", borderRadius: radius.full },
  midPointer: { position: "absolute", top: -4, bottom: -4, width: 4, backgroundColor: colors.primary, borderRadius: 2, marginLeft: -2 },
  barLabels: { flexDirection: "row", justifyContent: "space-between" },
  barLabelText: { fontSize: 10, color: colors.onSurfaceVariant },

  // Stats
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, padding: spacing.base, alignItems: "center", borderWidth: 0.5, borderColor: colors.outlineVariant, elevation: 2 },
  // Light pastel blue, not the dark primaryContainer navy - that made the
  // (equally dark) statValue/statLabel text on top nearly unreadable.
  statCardMid: { backgroundColor: colors.primaryFixed, borderColor: colors.primaryFixedDim },
  statValue: { fontSize: 16, fontWeight: "800", color: colors.primary, marginBottom: 2 },
  statLabel: { fontSize: 11, color: colors.onSurfaceVariant, textAlign: "center" },

  btnPrimary: { height: 56, backgroundColor: colors.primary, borderRadius: radius.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, elevation: 5 },
  btnPrimaryText: { fontSize: 17, fontWeight: "700", color: colors.onPrimary },
});

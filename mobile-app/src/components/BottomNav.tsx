import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "../constants/theme";
import { useTranslation, type TranslationKey } from "../lib/i18n";

// `key` is a stable, language-independent id used both for the `active`
// prop comparison and for looking up the translated label - keeping these
// separate means translating the visible label (labelKey) never breaks
// which tab is highlighted as active. Screens still pass `active="Home"` /
// "History" / "Evaluator" / "Profile" (the English key, not the translated
// label) - see each screen's <BottomNav active="..."> call.
const TABS = [
  { key: "Home",      labelKey: "nav.home" as TranslationKey,      icon: "home",            route: "/dashboard" },
  { key: "History",   labelKey: "nav.history" as TranslationKey,   icon: "history",         route: "/history"   },
  { key: "Evaluator", labelKey: "nav.evaluator" as TranslationKey, icon: "chart-bar",       route: "/evaluator" },
  { key: "Profile",   labelKey: "nav.profile" as TranslationKey,   icon: "account-outline", route: "/profile"   },
] as const;

export default function BottomNav({ active }: { active: string }) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View style={styles.bottomNav}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.navTab, isActive && styles.navTabActive]}
            activeOpacity={0.7}
            onPress={() => router.push(tab.route as any)}
          >
            <MaterialCommunityIcons
              name={tab.icon as any}
              size={24}
              color={isActive ? colors.onPrimaryContainer : colors.onSurfaceVariant}
            />
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
              {t(tab.labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    paddingTop: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderTopWidth: 0.5,
    borderTopColor: colors.outlineVariant,
    shadowColor: "#1a365d",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  navTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: radius.lg,
    minHeight: 52,
    gap: 3,
  },
  navTabActive: {
    backgroundColor: colors.primaryContainer + "33",
    transform: [{ scale: 0.93 }],
  },
  navLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.onSurfaceVariant,
  },
  navLabelActive: { color: colors.onPrimaryContainer },
});

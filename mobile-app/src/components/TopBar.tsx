import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, typography } from "../constants/theme";

interface TopBarProps {
  title?: string;
  onBack?: () => void;
  showBack?: boolean;
}

export default function TopBar({
  title = "AutoGuard AI",
  onBack,
  showBack = true,
}: TopBarProps) {
  const router = useRouter();

  const handleBack = onBack ?? (() => router.back());

  return (
    <View style={styles.topBar}>
      <View style={styles.topBarLeft}>
        {showBack && (
          <TouchableOpacity
            onPress={handleBack}
            activeOpacity={0.7}
            style={styles.iconBtn}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.primary} />
          </TouchableOpacity>
        )}
        <Text style={styles.topBarTitle}>{title}</Text>
      </View>
      <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn}>
        <MaterialCommunityIcons
          name="account-circle-outline"
          size={24}
          color={colors.primary}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    height: 56,
    backgroundColor: colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.outlineVariant,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBtn: {
    padding: 6,
    borderRadius: radius.full,
  },
  topBarTitle: {
    ...typography.headlineMd,
    color: colors.primary,
  },
});

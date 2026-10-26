/**
 * ChangePasswordModal.tsx
 * ========================
 * Card-over-backdrop modal (same style as OnboardingGuide) for changing the
 * account password. Verifies current_password server-side by re-signing in
 * with it before applying new_password - see backend-server/app/auth.py's
 * change_password(). All copy is i18n-wired via useTranslation().
 */

import { useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radius, typography } from "../constants/theme";
import { changePassword, ApiError } from "../lib/api";
import { useTranslation } from "../lib/i18n";

export default function ChangePasswordModal({
  visible,
  email,
  onClose,
}: {
  visible: boolean;
  email: string | null | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const handleClose = () => {
    if (isSubmitting) return; // don't let a mid-flight request get abandoned silently
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (newPassword.length < 6) {
      setError(t("profile.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("profile.passwordMismatch"));
      return;
    }
    if (!email) {
      setError(t("profile.changePasswordError"));
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(email, currentPassword, newPassword);
      reset();
      onClose();
      Alert.alert(t("profile.passwordUpdatedTitle"), t("profile.passwordUpdatedMessage"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("profile.changePasswordError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close" size={20} color={colors.onSurfaceVariant} />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="lock-reset" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t("profile.changePassword")}</Text>

          <View style={styles.fields}>
            <PasswordField
              label={t("profile.currentPasswordLabel")}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              editable={!isSubmitting}
            />
            <PasswordField
              label={t("profile.newPasswordLabel")}
              value={newPassword}
              onChangeText={setNewPassword}
              editable={!isSubmitting}
            />
            <PasswordField
              label={t("profile.confirmPasswordLabel")}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!isSubmitting}
            />
          </View>

          {error && (
            <View style={styles.errorRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={styles.submitBtnText}>{t("profile.updatePassword")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  editable,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  editable: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          editable={editable}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.onSurfaceVariant}
        />
        <TouchableOpacity onPress={() => setVisible((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 360, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl + 4, padding: spacing.xl, alignItems: "center", elevation: 8 },
  closeBtn: { position: "absolute", top: spacing.base, right: spacing.base, padding: 2, zIndex: 1 },
  iconWrap: { width: 56, height: 56, borderRadius: radius.lg + 4, backgroundColor: colors.primaryFixed, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  title: { ...typography.headlineMd, color: colors.onSurface, marginBottom: spacing.lg, textAlign: "center" },
  fields: { width: "100%", gap: spacing.sm + 2, marginBottom: spacing.sm },
  fieldWrap: { width: "100%", gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceVariant },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.lg, paddingHorizontal: spacing.base, paddingVertical: 12, borderWidth: 2, borderColor: "transparent" },
  fieldInput: { flex: 1, fontSize: 16, color: colors.onSurface, padding: 0 },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, width: "100%", marginBottom: spacing.sm, marginTop: 2 },
  errorText: { flex: 1, fontSize: 13, color: colors.error, lineHeight: 18 },
  submitBtn: { width: "100%", height: 52, backgroundColor: colors.primary, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: colors.onPrimary },
});

import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, Image, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { colors, spacing, radius, typography } from "../constants/theme";
import { POWERTRAIN_TYPES, POWERTRAIN_INFO, type PowertrainType } from "../constants/powertrain";
import { CURRENCIES, DEFAULT_CURRENCY } from "../constants/currency";
import { LANGUAGES, DEFAULT_LANGUAGE } from "../constants/language";
import { useProfile } from "../lib/profile";
import { useAuth } from "../lib/authStore";
import { useTranslation, type TranslationKey } from "../lib/i18n";
import { ApiError } from "../lib/api";
import Screen from "../components/Screen";
import BottomNav from "../components/BottomNav";
import TopBar from "../components/TopBar";
import ChangePasswordModal from "../components/ChangePasswordModal";

function EditableField({ label, value, onChange, onBlur, placeholder, icon, hint, keyboardType = "default", editable = true }: any) {
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldRow, !editable && styles.fieldRowReadonly]}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.onSurfaceVariant} />
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.onSurfaceVariant}
          editable={editable}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {editable && <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.outline} />}
      </View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

function InlinePicker({ icon, label, options, selected, onSelect }: any) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fieldCard}>
      <TouchableOpacity style={styles.inlinePickerRow} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <View style={styles.inlinePickerLeft}>
          <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
          <Text style={styles.inlinePickerLabel}>{label}</Text>
        </View>
        <View style={styles.inlinePickerValue}>
          <Text style={styles.inlinePickerValueText}>{selected}</Text>
          <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurfaceVariant} />
        </View>
      </TouchableOpacity>
      {open && (
        <View style={styles.pickerDropdown}>
          {options.map((opt: string) => (
            <TouchableOpacity key={opt} style={[styles.pickerOption, opt === selected && styles.pickerOptionActive]} onPress={() => { onSelect(opt); setOpen(false); }} activeOpacity={0.7}>
              <Text style={[styles.pickerOptionText, opt === selected && styles.pickerOptionTextActive]}>{opt}</Text>
              {opt === selected && <MaterialCommunityIcons name="check" size={16} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const POWERTRAIN_LABEL_KEY: Record<PowertrainType, TranslationKey> = {
  petrol: "powertrain.petrol",
  hybrid: "powertrain.hybrid",
  electric: "powertrain.electric",
};

/**
 * Powertrain picker for the chatbot: 3-card segmented control, plus a
 * "Not sure?" 2-question helper for anyone who doesn't know the term
 * "hybrid" off the top of their head. Answering the helper immediately
 * selects the matching card and closes the helper - no extra tap needed.
 * This only affects which fault_knowledge content the chatbot backend
 * retrieves; it has no effect on the ML fault detector.
 */
function PowertrainSelector({ value, onSelect }: { value: PowertrainType | null; onSelect: (p: PowertrainType) => void }) {
  const { t } = useTranslation();
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperStep, setHelperStep] = useState<1 | 2>(1);

  const resetHelper = () => {
    setHelperOpen(false);
    setHelperStep(1);
  };

  const selectAndClose = (type: PowertrainType) => {
    onSelect(type);
    resetHelper();
  };

  const answerHasTank = (hasTank: boolean) => {
    if (!hasTank) {
      selectAndClose("electric");
      return;
    }
    setHelperStep(2);
  };

  const answerHasPlugIn = (hasPlugIn: boolean) => {
    selectAndClose(hasPlugIn ? "hybrid" : "petrol");
  };

  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{t("profile.powertrainLabel")}</Text>
      <View style={styles.powertrainRow}>
        {POWERTRAIN_TYPES.map((type) => {
          const info = POWERTRAIN_INFO[type];
          const active = value === type;
          return (
            <TouchableOpacity
              key={type}
              style={[styles.powertrainCard, active && styles.powertrainCardActive]}
              onPress={() => selectAndClose(type)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name={info.icon} size={22} color={active ? colors.primary : colors.onSurfaceVariant} />
              <Text style={[styles.powertrainCardText, active && styles.powertrainCardTextActive]}>{t(POWERTRAIN_LABEL_KEY[type])}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity onPress={() => (helperOpen ? resetHelper() : setHelperOpen(true))} activeOpacity={0.7}>
        <Text style={styles.notSureLink}>{helperOpen ? t("common.cancel") : t("profile.notSureLink")}</Text>
      </TouchableOpacity>

      {helperOpen && helperStep === 1 && (
        <View style={styles.helperStep}>
          <Text style={styles.helperQuestion}>{t("profile.helperQ1")}</Text>
          <View style={styles.helperButtons}>
            <TouchableOpacity style={styles.helperBtn} onPress={() => answerHasTank(true)} activeOpacity={0.8}>
              <Text style={styles.helperBtnText}>{t("common.yes")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.helperBtn} onPress={() => answerHasTank(false)} activeOpacity={0.8}>
              <Text style={styles.helperBtnText}>{t("common.no")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {helperOpen && helperStep === 2 && (
        <View style={styles.helperStep}>
          <Text style={styles.helperQuestion}>{t("profile.helperQ2")}</Text>
          <View style={styles.helperButtons}>
            <TouchableOpacity style={styles.helperBtn} onPress={() => answerHasPlugIn(true)} activeOpacity={0.8}>
              <Text style={styles.helperBtnText}>{t("common.yes")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.helperBtn} onPress={() => answerHasPlugIn(false)} activeOpacity={0.8}>
              <Text style={styles.helperBtnText}>{t("common.no")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, powertrain, setPowertrain, setDisplayName, setCurrency, setLanguage, uploadAvatar } = useProfile();
  const { session, signOut } = useAuth();
  const { t } = useTranslation();
  const [usernameInput, setUsernameInput] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Shows the account email until the person sets an actual display name.
  const displayName = profile?.displayName || session?.email || "AutoGuard User";
  const currentCurrency = CURRENCIES.find((c) => c.code === (profile?.currency ?? DEFAULT_CURRENCY)) ?? CURRENCIES[0];
  const currentLanguage = LANGUAGES.find((l) => l.code === (profile?.language ?? DEFAULT_LANGUAGE)) ?? LANGUAGES[0];

  // Local input starts empty (placeholder shows the email) until the
  // person actually types something, so we don't overwrite their in-
  // progress edit every time the profile refreshes.
  useEffect(() => {
    setUsernameInput(profile?.displayName ?? "");
  }, [profile?.displayName]);

  const handleUsernameBlur = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed || trimmed === (profile?.displayName ?? "")) return;
    try {
      await setDisplayName(trimmed);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("profile.usernameSaveError");
      Alert.alert(t("profile.couldntSaveTitle"), message);
      setUsernameInput(profile?.displayName ?? ""); // revert the optimistic local edit
    }
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("profile.permissionNeededTitle"), t("profile.permissionNeededMessage"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      // MediaTypeOptions.Images is deprecated in favor of this array form.
      mediaTypes: ["images"],
      // allowsEditing hands off to the OS's native crop screen, which on
      // Android is notoriously unreliable - on a lot of devices/OEM skins
      // its confirm button doesn't register a tap at all, leaving the user
      // stuck on the crop screen with no way forward. Skipping it entirely
      // avoids that failure mode; the avatar <Image> below already uses
      // resizeMode="cover" in a fixed circular frame, so any picked photo
      // still ends up cropped to a clean circle regardless of its original
      // aspect ratio - no native crop step needed to get that result.
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(asset.uri, asset.fileName ?? "avatar.jpg", asset.mimeType ?? "image/jpeg");
    } catch (err) {
      // Logged so a real bug (vs. an actual network/connection issue) shows
      // up in Metro's logs instead of being indistinguishable from either.
      console.error("Avatar upload failed:", err);
      Alert.alert(t("profile.uploadFailedTitle"), t("profile.uploadFailedMessage"));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(t("profile.signOutConfirmTitle"), t("profile.signOutConfirmMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.signOut"),
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/" as any);
        },
      },
    ]);
  };

  return (
    <Screen>
      <TopBar title="AutoGuard AI" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <MaterialCommunityIcons name="account" size={40} color={colors.onPrimary} />
              )}
            </View>
            <TouchableOpacity style={styles.editAvatarBtn} activeOpacity={0.8} onPress={handlePickAvatar} disabled={isUploadingAvatar}>
              {isUploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <MaterialCommunityIcons name="pencil" size={14} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>{displayName}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeader}>{t("profile.securitySection")}</Text>
        <EditableField
          label={t("profile.usernameLabel")}
          value={usernameInput}
          onChange={setUsernameInput}
          onBlur={handleUsernameBlur}
          placeholder={session?.email ?? ""}
          icon="account-outline"
        />
        <EditableField label={t("profile.emailLabel")} value={session?.email ?? ""} icon="email-outline" editable={false} />
        <TouchableOpacity style={styles.actionRow} activeOpacity={0.8} onPress={() => setIsChangePasswordOpen(true)}>
          <View style={styles.actionRowLeft}>
            <View style={styles.actionIconWrap}>
              <MaterialCommunityIcons name="lock-reset" size={22} color={colors.error} />
            </View>
            <View>
              <Text style={styles.actionRowTitle}>{t("profile.changePassword")}</Text>
              <Text style={styles.actionRowSub}>{t("profile.changePasswordSub")}</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.outline} />
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>{t("profile.vehicleSection")}</Text>
        <View>
          <PowertrainSelector value={powertrain} onSelect={setPowertrain} />
          <View style={styles.regionHint}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.onTertiaryFixedVariant} />
            <Text style={styles.regionHintText}>{t("profile.powertrainHint")}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeader}>{t("profile.preferencesSection")}</Text>
        <View>
          <InlinePicker
            icon="translate"
            label={t("profile.languageLabel")}
            options={LANGUAGES.map((l) => l.label)}
            selected={currentLanguage.label}
            onSelect={(label: string) => {
              const match = LANGUAGES.find((l) => l.label === label);
              if (match) setLanguage(match.code);
            }}
          />
          <View style={styles.regionHint}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.onTertiaryFixedVariant} />
            <Text style={styles.regionHintText}>{t("profile.languageHint")}</Text>
          </View>
        </View>
        <View>
          <InlinePicker
            icon="cash-multiple"
            label={t("profile.currencyLabel")}
            options={CURRENCIES.map((c) => c.label)}
            selected={currentCurrency.label}
            onSelect={(label: string) => {
              const match = CURRENCIES.find((c) => c.label === label);
              if (match) setCurrency(match.code);
            }}
          />
          <View style={styles.regionHint}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.onTertiaryFixedVariant} />
            <Text style={styles.regionHintText}>{t("profile.currencyHint")}</Text>
          </View>
        </View>

        <View style={styles.dangerZone}>
          <TouchableOpacity style={styles.signOutBtn} activeOpacity={0.85} onPress={handleSignOut}>
            <MaterialCommunityIcons name="logout" size={20} color={colors.secondary} />
            <Text style={styles.signOutText}>{t("profile.signOut")}</Text>
          </TouchableOpacity>
          <Text style={styles.versionText}>AutoGuard AI Version 1.0.4 | © 2024</Text>
        </View>
      </ScrollView>
      <BottomNav active="Profile" />
      <ChangePasswordModal
        visible={isChangePasswordOpen}
        email={session?.email}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxxl, gap: spacing.sm + 2 },
  heroCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, borderLeftWidth: 4, borderLeftColor: colors.primary, padding: spacing.base + 4, flexDirection: "row", alignItems: "center", gap: spacing.base + 4, elevation: 3, marginBottom: spacing.sm },
  avatarWrap: { position: "relative" },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryContainer, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  editAvatarBtn: { position: "absolute", bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceContainerLowest, borderWidth: 1.5, borderColor: colors.outlineVariant, alignItems: "center", justifyContent: "center", elevation: 3 },
  heroInfo: { flex: 1 },
  heroName: { ...typography.headlineMd, color: colors.onSurface, marginBottom: 2 },
  heroSub: { fontSize: 16, color: colors.onSurfaceVariant, lineHeight: 22 },
  sectionHeader: { fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: colors.outline, paddingHorizontal: 4, marginTop: spacing.sm, marginBottom: 2 },
  fieldCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, padding: spacing.base, elevation: 2, gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: colors.onSurfaceVariant },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.lg, paddingHorizontal: spacing.base, paddingVertical: 12, borderWidth: 2, borderColor: "transparent" },
  fieldRowReadonly: { opacity: 0.75 },
  fieldInput: { flex: 1, fontSize: 16, color: colors.onSurface, padding: 0 },
  fieldHint: { fontSize: 11, color: colors.outline, lineHeight: 16 },
  actionRow: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, padding: spacing.base, flexDirection: "row", alignItems: "center", justifyContent: "space-between", elevation: 2 },
  actionRowLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  actionIconWrap: { width: 40, height: 40, backgroundColor: colors.error + "18", borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  actionRowTitle: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  actionRowSub: { fontSize: 12, color: colors.outline, marginTop: 1 },
  inlinePickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.base },
  inlinePickerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  inlinePickerLabel: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  inlinePickerValue: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceContainerLow, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.lg },
  inlinePickerValueText: { fontSize: 14, color: colors.onSurface, fontWeight: "500" },
  pickerDropdown: { borderTopWidth: 0.5, borderTopColor: colors.outlineVariant },
  pickerOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.base, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: colors.outlineVariant },
  pickerOptionActive: { backgroundColor: colors.primaryFixed + "33" },
  pickerOptionText: { fontSize: 15, color: colors.onSurface },
  pickerOptionTextActive: { color: colors.primary, fontWeight: "700" },
  regionHint: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.tertiaryFixed + "33", marginHorizontal: spacing.base, marginBottom: spacing.base, padding: 10, borderRadius: radius.lg },
  regionHintText: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.onTertiaryFixedVariant, lineHeight: 18 },
  powertrainRow: { flexDirection: "row", gap: 8 },
  powertrainCard: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: colors.surfaceContainerLow, borderWidth: 2, borderColor: "transparent" },
  powertrainCardActive: { backgroundColor: colors.primaryFixed + "33", borderColor: colors.primary },
  powertrainCardText: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceVariant, textAlign: "center" },
  powertrainCardTextActive: { color: colors.primary, fontWeight: "700" },
  notSureLink: { fontSize: 12, fontWeight: "600", color: colors.primary, textAlign: "center", marginTop: 2 },
  helperStep: { backgroundColor: colors.surfaceContainerLow, borderRadius: radius.lg, padding: spacing.base, gap: 10 },
  helperQuestion: { fontSize: 13, fontWeight: "600", color: colors.onSurface, lineHeight: 18 },
  helperButtons: { flexDirection: "row", gap: 8 },
  helperBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant },
  helperBtnText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  dangerZone: { gap: spacing.base, paddingTop: spacing.base, alignItems: "center" },
  signOutBtn: { width: "100%", height: 54, borderWidth: 2, borderColor: colors.secondary, borderRadius: radius.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  signOutText: { fontSize: 16, fontWeight: "700", color: colors.secondary },
  versionText: { fontSize: 11, color: colors.outline, textAlign: "center", marginTop: 4 }});

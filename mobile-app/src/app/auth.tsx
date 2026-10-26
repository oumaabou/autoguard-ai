import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Image,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, typography } from "../constants/theme";
import { useAuth } from "../lib/authStore";
import { ApiError } from "../lib/api";
import Screen from "../components/Screen";

export default function AuthScreen() {
  const router = useRouter();
  const { signUp, logIn } = useAuth();
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const isLogin = activeTab === "login";

  const switchTab = (tab: "login" | "signup") => {
    setActiveTab(tab);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setInfoMessage(null);

    if (isLogin) {
      if (!identifier.trim() || !password) {
        setErrorMessage("Enter your email or username, and password.");
        return;
      }
    } else if (!email.trim() || !username.trim() || !password) {
      setErrorMessage("Enter your email, a username, and a password.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        await logIn(identifier.trim(), password);
        router.replace("/dashboard" as any);
      } else {
        const { needsEmailConfirmation } = await signUp(email.trim(), password, username.trim());
        if (needsEmailConfirmation) {
          setInfoMessage("Account created - check your email to confirm it, then log in.");
          setActiveTab("login");
        } else {
          router.replace("/dashboard" as any);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Brand */}
          <View style={styles.brandSection}>
            <Image source={require("../../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
            <Text style={styles.brandName}>AutoGuard AI</Text>
            <Text style={styles.brandSub}>Shield yourself from bias with knowledge.</Text>
          </View>

          {/* Tab Toggle */}
          <View style={styles.tabBar}>
            <TouchableOpacity style={[styles.tab, isLogin && styles.tabActive]} onPress={() => switchTab("login")} activeOpacity={0.8}>
              <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, !isLogin && styles.tabActive]} onPress={() => switchTab("signup")} activeOpacity={0.8}>
              <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {infoMessage && (
            <View style={styles.infoBanner}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.infoBannerText}>{infoMessage}</Text>
            </View>
          )}
          {errorMessage && (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          )}

          {/* Form Card */}
          <View style={styles.card}>
            {isLogin ? (
              /* Email or Username */
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email or Username</Text>
                <View style={styles.inputWrap}>
                  <MaterialCommunityIcons name="account-outline" size={20} color={colors.outline} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="name@xx.com or username" placeholderTextColor={colors.outline} value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} />
                </View>
              </View>
            ) : (
              <>
                {/* Email */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email Address</Text>
                  <View style={styles.inputWrap}>
                    <MaterialCommunityIcons name="email-outline" size={20} color={colors.outline} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="name@example.com" placeholderTextColor={colors.outline} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                  </View>
                </View>

                {/* Username */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Username</Text>
                  <View style={styles.inputWrap}>
                    <MaterialCommunityIcons name="account-outline" size={20} color={colors.outline} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="e.g. alex_drives" placeholderTextColor={colors.outline} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
                  </View>
                  <Text style={styles.fieldHint}>Must be unique - you can log in with username or email.</Text>
                </View>
              </>
            )}

            {/* Password */}
            <View style={styles.fieldGroup}>
              {/* No "Forgot Password?" flow yet - deliberately left out rather
                  than shipping a dead link (was previously here with no
                  onPress at all). Documented as a known limitation; revisit
                  if there's time - see the forgot-password planning
                  discussion for the recommended approach (in-app OTP-code
                  reset via Supabase's reset_password_for_email, no deep
                  linking needed). */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
              </View>
              <View style={styles.inputWrap}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={colors.outline} style={styles.inputIcon} />
                <TextInput style={[styles.input, { paddingRight: 48 }]} placeholder="••••••••" placeholderTextColor={colors.outline} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)} activeOpacity={0.7}>
                  <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.outline} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.btnPrimary, isSubmitting && { opacity: 0.6 }]}
              activeOpacity={0.85}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              <Text style={styles.btnPrimaryText}>
                {isSubmitting ? "Please wait..." : isLogin ? "Secure Access" : "Create Account"}
              </Text>
              {!isSubmitting && <MaterialCommunityIcons name="arrow-right" size={20} color={colors.onPrimary} />}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl, alignItems: "center" },
  brandSection: { alignItems: "center", marginBottom: spacing.xxl + 4 },
  logo: { width: 96, height: 96, marginBottom: spacing.base },
  brandName: { ...typography.headlineLgMobile, color: colors.primary, marginBottom: 6 },
  brandSub: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: "center", maxWidth: 280 },
  tabBar: { flexDirection: "row", backgroundColor: colors.surfaceContainer, borderRadius: radius.xl, padding: 6, width: "100%", marginBottom: spacing.xxl, elevation: 2 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: radius.lg, alignItems: "center" },
  tabActive: { backgroundColor: colors.surfaceContainerLowest, elevation: 2 },
  tabText: { ...typography.labelStatus, color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.primary },
  infoBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primaryFixed + "33", padding: spacing.sm + 2, borderRadius: radius.lg, width: "100%", marginBottom: spacing.base },
  infoBannerText: { flex: 1, fontSize: 13, color: colors.primaryContainer, lineHeight: 18 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.error + "18", padding: spacing.sm + 2, borderRadius: radius.lg, width: "100%", marginBottom: spacing.base },
  errorBannerText: { flex: 1, fontSize: 13, color: colors.error, lineHeight: 18 },
  card: { width: "100%", backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl + 4, padding: spacing.xxl, borderWidth: 0.5, borderColor: colors.outlineVariant, elevation: 3, gap: spacing.lg + 4, marginBottom: spacing.xl },
  fieldGroup: { gap: spacing.sm },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { ...typography.labelStatus, color: colors.onSurface },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 2, borderColor: "transparent", height: 56, paddingHorizontal: spacing.base },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: colors.onSurface, height: "100%" },
  eyeBtn: { position: "absolute", right: 14, height: "100%", justifyContent: "center" },
  fieldHint: { fontSize: 13, color: colors.onSurfaceVariant, opacity: 0.7 },
  btnPrimary: { height: 56, backgroundColor: colors.primary, borderRadius: radius.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, elevation: 5, marginTop: spacing.sm },
  btnPrimaryText: { ...typography.headlineMd, color: colors.onPrimary, fontSize: 18 }});
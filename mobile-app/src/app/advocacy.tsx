import { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { colors, spacing, radius, typography } from "../constants/theme";
import { FAULT_INFO, type FaultLabel } from "../constants/faults";
import { useProfile } from "../lib/profile";
import { diagnoseFault, askQuestion, ApiError } from "../lib/api";
import { createConversation, appendMessages, getConversation, type ChatMessage } from "../lib/chatHistory";
import { useTranslation } from "../lib/i18n";
import Screen from "../components/Screen";
import BottomNav from "../components/BottomNav";
import TopBar from "../components/TopBar";

function getTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Fallback is passed in (rather than looked up here) since these are plain
// functions, not components - they can't call the useTranslation() hook
// themselves, so the caller resolves the translated fallback text first.
function faultTitle(faultType: string | undefined, fallback: string): string {
  if (faultType && (faultType as FaultLabel) in FAULT_INFO) {
    return FAULT_INFO[faultType as FaultLabel].title;
  }
  return faultType || fallback;
}

function errorMessageText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(600),
      ])).start();
    bounce(dot1, 0); bounce(dot2, 200); bounce(dot3, 400);
  }, []);
  return (
    <View style={styles.typingWrap}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

export default function AdvocacyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    faultType?: string;
    confidence?: string;
    conversationId?: string;
  }>();
  const { profile, powertrain } = useProfile();
  const { t } = useTranslation();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Guards the load effect below against running twice on the same mount
  // (React's Strict Mode double-invokes effects in dev to catch exactly
  // this kind of bug) - without it, two overlapping runs could both see an
  // empty saved conversation, both generate an opening message with the
  // same id, and both append it, producing two messages with a duplicate
  // key (the "two children with the same key" warning).
  const hasLoadedRef = useRef(false);

  const faultType = params.faultType ?? null;
  const confidence = params.confidence ? parseFloat(params.confidence) : null;

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }, [messages, isTyping]);

  // On open: reopen a saved thread (conversationId param, from History or
  // from the diagnostic screen's Save/Talk-to-Bot buttons - see
  // diagnostic.tsx's ensureConversationId), start a new thread grounded in
  // a just-diagnosed fault (faultType param, a fallback for older
  // navigation or if creating the record failed), or show a plain greeting
  // for anyone who opens chat with no context at all.
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    (async () => {
      if (params.conversationId) {
        const saved = await getConversation(params.conversationId);
        if (saved) {
          setConversationId(saved.id);
          if (saved.messages.length > 0) {
            setMessages(saved.messages);
            return;
          }
          // A diagnosis was saved (severity + price card) but no chat has
          // happened yet on this record - seed the opening explanation now
          // and attach it to this SAME record, rather than creating a
          // second one.
          if (saved.faultType) {
            setIsTyping(true);
            try {
              const result = await diagnoseFault(saved.faultType, saved.confidence, saved.powertrain);
              const opening: ChatMessage = {
                id: "opening",
                role: "bot",
                text: result.explanation,
                time: getTime(),
                isRecommendation: true,
              };
              setMessages([opening]);
              await appendMessages(saved.id, [opening]);
            } catch (err) {
              setMessages([{ id: "error", role: "bot", text: errorMessageText(err, t("advocacy.genericError")), time: getTime() }]);
            } finally {
              setIsTyping(false);
            }
          }
          return;
        }
      }

      if (faultType) {
        setIsTyping(true);
        try {
          const result = await diagnoseFault(faultType, confidence, powertrain);
          const opening: ChatMessage = {
            id: "opening",
            role: "bot",
            text: result.explanation,
            time: getTime(),
            isRecommendation: true,
          };
          setMessages([opening]);
          const validLabel = (faultType as FaultLabel) in FAULT_INFO ? (faultType as FaultLabel) : null;
          const convo = await createConversation({
            faultType,
            confidence,
            powertrain,
            title: faultTitle(faultType, t("advocacy.generalQuestion")),
            messages: [opening],
            severity: validLabel ? FAULT_INFO[validLabel].severity : null,
            costLow: result.knowledge?.typical_cost_low ?? null,
            costHigh: result.knowledge?.typical_cost_high ?? null,
          });
          setConversationId(convo.id);
        } catch (err) {
          setMessages([{ id: "error", role: "bot", text: errorMessageText(err, t("advocacy.genericError")), time: getTime() }]);
        } finally {
          setIsTyping(false);
        }
        return;
      }

      setMessages([{
        id: "greeting",
        role: "bot",
        text: t("advocacy.greeting"),
        time: getTime(),
      }]);
    })();
    // Only run once per screen instance (params are stable for the life of this screen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text, time: getTime() };
    // Pre-update `messages` (not yet including userMsg) - the last ~6 turns
    // give Gemini/Groq enough context for "what about..." style follow-ups
    // without growing the prompt unbounded as a conversation gets long.
    const recentHistory = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    try {
      const result = await askQuestion(text, faultType, powertrain, recentHistory, profile?.language);
      const botMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "bot", text: result.answer, time: getTime() };
      setMessages((prev) => [...prev, botMsg]);

      if (conversationId) {
        await appendMessages(conversationId, [userMsg, botMsg]);
      } else {
        const convo = await createConversation({
          faultType,
          confidence,
          powertrain,
          title: faultTitle(faultType ?? undefined, t("advocacy.generalQuestion")),
          messages: [userMsg, botMsg],
        });
        setConversationId(convo.id);
      }
    } catch (err) {
      const errMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "bot", text: errorMessageText(err, t("advocacy.genericError")), time: getTime() };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Advocacy AI" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <ScrollView ref={scrollRef} style={styles.chatScroll} contentContainerStyle={styles.chatContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.dateDivider}>
            <View style={styles.dateChip}><Text style={styles.dateChipText}>{t("advocacy.today")}</Text></View>
          </View>
          {messages.map((msg, idx) => msg.role === "bot" ? (
            <View key={`${msg.id}-${idx}`} style={styles.botBubbleWrap}>
              <View style={[styles.botBubble, msg.isRecommendation && styles.recommendationBubble]}>
                {msg.isRecommendation ? (
                  <>
                    <View style={styles.recHeader}>
                      <MaterialCommunityIcons name="shield-check" size={16} color={colors.primary} />
                      <Text style={styles.recLabel}>{t("advocacy.aiDiagnosis")}</Text>
                    </View>
                    <Text style={styles.botText}>{msg.text}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.botMeta}>Advocacy AI | {msg.time}</Text>
                    <Text style={styles.botText}>{msg.text}</Text>
                  </>
                )}
              </View>
            </View>
          ) : (
            <View key={`${msg.id}-${idx}`} style={styles.userBubbleWrap}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{msg.text}</Text>
                <Text style={styles.userMeta}>{t("advocacy.readPrefix")}{msg.time}</Text>
              </View>
            </View>
          ))}
          {isTyping && <View style={styles.botBubbleWrap}><TypingIndicator /></View>}
        </ScrollView>
        <View style={styles.inputBar}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="plus-circle-outline" size={24} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            <TextInput style={styles.textInput} value={inputText} onChangeText={setInputText} placeholder={t("advocacy.inputPlaceholder")} placeholderTextColor={colors.onSurfaceVariant} multiline maxLength={500} />
            <TouchableOpacity style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]} onPress={handleSend} activeOpacity={0.8} disabled={!inputText.trim()}>
              <MaterialCommunityIcons name="send" size={18} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.disclaimer}>{t("advocacy.disclaimer")}</Text>
        </View>
      </KeyboardAvoidingView>
      <BottomNav active="Chat" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  chatScroll: { flex: 1 },
  chatContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl, gap: spacing.base + 4 },
  dateDivider: { alignItems: "center", marginBottom: spacing.sm },
  dateChip: { backgroundColor: colors.surfaceContainerHigh, paddingHorizontal: 16, paddingVertical: 5, borderRadius: radius.full },
  dateChipText: { ...typography.labelStatus, color: colors.onSurfaceVariant, fontSize: 13 },
  botBubbleWrap: { alignItems: "flex-start", maxWidth: "88%" },
  botBubble: { backgroundColor: colors.surfaceContainerLowest, borderLeftWidth: 4, borderLeftColor: colors.tertiaryFixedDim, borderRadius: radius.xl, borderTopLeftRadius: 4, padding: spacing.base, elevation: 3, gap: 6 },
  botMeta: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: colors.onSurfaceVariant, marginBottom: 2 },
  botText: { fontSize: 16, color: colors.onSurface, lineHeight: 24 },
  recommendationBubble: { borderColor: colors.primary, borderWidth: 1.5, borderLeftWidth: 4, borderLeftColor: colors.tertiaryFixedDim, maxWidth: "100%" },
  recHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  recLabel: { ...typography.labelStatus, color: colors.primary, fontSize: 14 },
  userBubbleWrap: { alignItems: "flex-end", alignSelf: "flex-end", maxWidth: "85%" },
  userBubble: { backgroundColor: colors.primary, borderRadius: radius.xl, borderTopRightRadius: 4, padding: spacing.base, elevation: 4, gap: 4 },
  userText: { fontSize: 16, color: colors.onPrimary, lineHeight: 24 },
  userMeta: { fontSize: 11, color: colors.onPrimary, opacity: 0.7, textAlign: "right", fontWeight: "600" },
  typingWrap: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surfaceContainer, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.full, alignSelf: "flex-start" },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  inputBar: { backgroundColor: colors.surfaceContainerLowest, paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.outlineVariant, gap: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceContainerLowest, borderWidth: 2, borderColor: colors.outlineVariant, borderRadius: radius.xl, paddingHorizontal: spacing.base, paddingVertical: 8, gap: 10, minHeight: 52 },
  attachBtn: { padding: 2 },
  textInput: { flex: 1, fontSize: 16, color: colors.onSurface, maxHeight: 100, padding: 0 },
  sendBtn: { width: 36, height: 36, backgroundColor: colors.primary, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: colors.surfaceContainerHigh },
  disclaimer: { fontSize: 11, color: colors.onSurfaceVariant, paddingHorizontal: spacing.sm }});

import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, typography } from "../constants/theme";
import { listConversations, deleteConversation, type Conversation } from "../lib/chatHistory";
import { FAULT_INFO, SEVERITY_COLOR, type FaultLabel, type Severity } from "../constants/faults";
import { currencySymbol, DEFAULT_CURRENCY } from "../constants/currency";
import { useProfile } from "../lib/profile";
import { useExchangeRates } from "../lib/exchangeRates";
import { useTranslation, type TranslationKey } from "../lib/i18n";
import Screen from "../components/Screen";
import BottomNav from "../components/BottomNav";
import TopBar from "../components/TopBar";

function formatDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();
}

const SEVERITY_LABEL_KEY: Record<Severity, TranslationKey> = {
  healthy: "history.severityHealthy",
  warning: "history.severityWarning",
  critical: "history.severityCritical",
};

function faultIcon(faultType: string | null): React.ComponentProps<typeof MaterialCommunityIcons>["name"] {
  if (faultType && (faultType as FaultLabel) in FAULT_INFO) {
    return FAULT_INFO[faultType as FaultLabel].icon;
  }
  return "car-cog";
}

/** Each saved item is a diagnosis card (color-coded severity + fair-price
 * range) with an optional chat preview underneath, if a discussion actually
 * happened on it - matching what "Save to History" now captures. */
function SavedDiagnosisCard({ conversation, symbol, currencyCode, onPress, onDelete }: { conversation: Conversation; symbol: string; currencyCode: string; onPress: () => void; onDelete: () => void }) {
  const { convert } = useExchangeRates();
  const { t } = useTranslation();
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const hasDiscussion = conversation.messages.length > 0;
  const hasPrice = conversation.costLow != null && conversation.costHigh != null;
  const severityColor = conversation.severity ? SEVERITY_COLOR[conversation.severity] : colors.outline;
  // costLow/costHigh were snapshotted in USD at save time (see
  // diagnostic.tsx's ensureConversationId) - convert to whichever currency
  // is selected now, same as the live Evaluator lookup.
  const displayCostLow = hasPrice ? convert(conversation.costLow as number, currencyCode) : null;
  const displayCostHigh = hasPrice ? convert(conversation.costHigh as number, currencyCode) : null;

  const confirmDelete = () => {
    Alert.alert(
      t("history.deleteTitle"),
      t("history.deleteMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: onDelete },
      ]
    );
  };

  return (
    <TouchableOpacity style={styles.discussionCard} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.severityBar, { backgroundColor: severityColor }]} />
      <View style={styles.cardInner}>
        <View style={styles.discussionTopRow}>
          <View style={styles.titleRow}>
            <MaterialCommunityIcons name={faultIcon(conversation.faultType)} size={18} color={severityColor} />
            <Text style={styles.discussionTitle}>{conversation.title}</Text>
          </View>
          <Text style={styles.discussionDate}>{formatDate(conversation.updatedAt)}</Text>
        </View>

        <View style={styles.metaRow}>
          {conversation.severity && (
            <View style={[styles.severityChip, { backgroundColor: severityColor + "22" }]}>
              <Text style={[styles.severityChipText, { color: severityColor }]}>
                {t(SEVERITY_LABEL_KEY[conversation.severity])}
              </Text>
            </View>
          )}
          {hasPrice && (
            <Text style={styles.priceText}>
              {symbol} {displayCostLow} — {symbol} {displayCostHigh}
            </Text>
          )}
        </View>

        {hasDiscussion ? (
          <View style={styles.previewRow}>
            <MaterialCommunityIcons name="chat-outline" size={13} color={colors.onSurfaceVariant} />
            <Text style={styles.discussionPreview} numberOfLines={1}>
              {lastMessage.role === "user" ? t("history.youPrefix") : ""}
              {lastMessage.text}
            </Text>
          </View>
        ) : (
          <View style={styles.previewRow}>
            <MaterialCommunityIcons name="chat-plus-outline" size={13} color={colors.onSurfaceVariant} />
            <Text style={styles.discussionPreviewMuted}>{t("history.noDiscussionYet")}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.deleteBtn} activeOpacity={0.7} onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
        </TouchableOpacity>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outline} />
      </View>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const { t } = useTranslation();
  const symbol = currencySymbol(profile?.currency);
  const currencyCode = profile?.currency ?? DEFAULT_CURRENCY;
  const [conversations, setConversations] = useState<Conversation[]>([]);

  // Re-runs on every mount, which - since BottomNav pushes a fresh screen
  // per tab tap rather than using a persistent tab navigator - means this
  // reloads each time the user taps into History, picking up any chat that
  // happened since the last visit.
  useEffect(() => {
    listConversations().then(setConversations);
  }, []);

  const handleDelete = async (id: string) => {
    // Optimistic removal - the card disappears immediately rather than
    // waiting on the network, since this is a destructive action the user
    // already confirmed via the Alert in SavedDiagnosisCard.
    setConversations((prev) => prev.filter((c) => c.id !== id));
    const ok = await deleteConversation(id);
    if (!ok) {
      // Deletion failed server-side (e.g. backend unreachable) - reload
      // from the server to put it back rather than leaving the UI wrong.
      listConversations().then(setConversations);
    }
  };

  return (
    <Screen>
      <TopBar title="AutoGuard AI" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>{t("history.title")}</Text>
          <Text style={styles.pageSub}>{t("history.subtitle")}</Text>
        </View>
        {conversations.length === 0 ? (
          <View style={styles.emptyDiscussions}>
            <MaterialCommunityIcons name="forum-outline" size={36} color={colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
            <Text style={styles.emptyDiscussionsText}>
              {t("history.emptyText")}
            </Text>
          </View>
        ) : (
          <>
            {conversations.map((conversation) => (
              <SavedDiagnosisCard
                key={conversation.id}
                conversation={conversation}
                symbol={symbol}
                currencyCode={currencyCode}
                onPress={() => router.push({ pathname: "/advocacy", params: { conversationId: conversation.id } } as any)}
                onDelete={() => handleDelete(conversation.id)}
              />
            ))}
            <View style={styles.endState}>
              <MaterialCommunityIcons name="history" size={44} color={colors.onSurfaceVariant} style={{ opacity: 0.35 }} />
              <Text style={styles.endStateText}>{t("history.endOfHistory")}</Text>
            </View>
          </>
        )}
      </ScrollView>
      <BottomNav active="History" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl, gap: spacing.base + 4 },
  pageHeader: { marginBottom: 4 },
  pageTitle: { ...typography.headlineLgMobile, color: colors.onSurface },
  pageSub: { fontSize: 15, color: colors.onSurfaceVariant, lineHeight: 22, marginTop: 4 },
  discussionCard: { flexDirection: "row", alignItems: "stretch", backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, overflow: "hidden", elevation: 2 },
  cardActions: { alignItems: "center", justifyContent: "center", gap: 10, paddingRight: spacing.sm },
  deleteBtn: { padding: 2 },
  severityBar: { width: 6, flexShrink: 0 },
  cardInner: { flex: 1, padding: spacing.base, gap: 6 },
  discussionTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  discussionTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, flex: 1 },
  discussionDate: { fontSize: 10, fontWeight: "700", color: colors.onSurfaceVariant, letterSpacing: 0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  severityChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  severityChipText: { fontSize: 11, fontWeight: "700" },
  priceText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceVariant },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  discussionPreview: { fontSize: 13, color: colors.onSurfaceVariant, flex: 1 },
  discussionPreviewMuted: { fontSize: 13, color: colors.onSurfaceVariant, opacity: 0.6, flex: 1, fontStyle: "italic" },
  emptyDiscussions: { alignItems: "center", gap: 8, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyDiscussionsText: { fontSize: 13, color: colors.onSurfaceVariant, textAlign: "center", lineHeight: 19, opacity: 0.7 },
  endState: { alignItems: "center", paddingVertical: spacing.xxl, gap: 8, opacity: 0.4 },
  endStateText: { fontSize: 16, color: colors.onSurfaceVariant },
});

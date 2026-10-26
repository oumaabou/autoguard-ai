import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../constants/theme";

export default function Screen({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <SafeAreaView style={[styles.safe, style]} edges={["top", "bottom"]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});

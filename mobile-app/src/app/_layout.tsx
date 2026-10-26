import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProfileProvider } from "../lib/profile";
import { AuthProvider } from "../lib/authStore";
import { ExchangeRatesProvider } from "../lib/exchangeRates";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ExchangeRatesProvider>
        <AuthProvider>
          <ProfileProvider>
            <StatusBar barStyle="dark-content" backgroundColor="#f7f9fb" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="dashboard" />
              <Stack.Screen name="diagnostic" />
              <Stack.Screen name="evaluator" />
              <Stack.Screen name="history" />
              <Stack.Screen name="profile" />
              <Stack.Screen name="advocacy" />
            </Stack>
          </ProfileProvider>
        </AuthProvider>
      </ExchangeRatesProvider>
    </SafeAreaProvider>
  );
}

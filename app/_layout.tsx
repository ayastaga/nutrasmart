// app/_layout.tsx
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import * as Linking from "expo-linking";

import { SplashScreenController } from "@/components/splash-screen-controller";
import { supabase } from "@/lib/supabase";

import { useAuthContext } from "@/hooks/use-auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import AuthProvider from "../providers/auth-providers";

import "../global.css";

// Separate RootNavigator so we can access the AuthContext
function RootNavigator() {
  const { isLoggedIn } = useAuthContext();
  const router = useRouter();

  // Handle deep links for OAuth callback
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      console.log("Deep link received:", event.url);

      // Check if it's the OAuth callback
      if (event.url.includes("google-auth")) {
        // Parse tokens from URL
        let params: URLSearchParams;

        if (event.url.includes("#")) {
          const hashPart = event.url.split("#")[1];
          params = new URLSearchParams(hashPart);
        } else if (event.url.includes("?")) {
          const queryPart = event.url.split("?")[1];
          params = new URLSearchParams(queryPart);
        } else {
          return;
        }

        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (!error) {
            console.log("✅ Session set from deep link");
            // The auth state change listener will handle navigation
          } else {
            console.error("Error setting session from deep link:", error);
          }
        }
      }
    };

    // Listen for deep links when app is already open
    const subscription = Linking.addEventListener("url", handleDeepLink);

    // Handle deep link if app was opened from one
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Listen to auth state changes
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.email);

      if (event === "SIGNED_IN" && session) {
        // User just signed in, navigate to main app
        router.replace("/(tabs)");
      } else if (event === "SIGNED_OUT") {
        // User signed out, navigate to login
        router.replace("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <Stack>
      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="+not-found" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  {
    /* 
  const [loaded] = useFonts({
    PPMontreal: require("../assets/fonts/ppneuemontreal-book.otf"),
  });

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }
    */
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <SplashScreenController />
        <RootNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </ThemeProvider>
  );
}

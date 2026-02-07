import { supabase } from "@/lib/supabase";
import { useEffect } from "react";
import { TouchableOpacity, Platform } from "react-native";

import { expo } from "@/app.json";
import { Text } from "@react-navigation/elements";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

WebBrowser.maybeCompleteAuthSession();

export default function GoogleSignInButton() {
  async function onSignInButtonPress() {
    console.debug("onSignInButtonPress - start");

    // Create the redirect URL using expo-linking
    const redirectUrl = Linking.createURL("google-auth");
    console.debug("Redirect URL:", redirectUrl);

    const res = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
        skipBrowserRedirect: true,
      },
    });

    const googleOAuthUrl = res.data.url;
    if (!googleOAuthUrl) {
      console.error("no oauth url found!");
      return;
    }

    console.debug("Opening OAuth URL:", googleOAuthUrl);

    const result = await WebBrowser.openAuthSessionAsync(
      googleOAuthUrl,
      redirectUrl,
    );

    console.debug("WebBrowser Result:", result);

    if (result.type === "success") {
      const url = result.url;
      console.debug("Success URL:", url);

      // Parse the URL hash parameters
      const urlParts = url.split("#");
      if (urlParts.length > 1) {
        const params = new URLSearchParams(urlParts[1]);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        if (access_token && refresh_token) {
          console.debug("Setting session with tokens");
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) {
            console.error("Error setting session:", error);
          } else {
            console.log("Session set successfully:", data.session?.user?.email);
          }
        } else {
          console.error("No tokens found in URL");
        }
      }
    } else if (result.type === "cancel") {
      console.log("User cancelled the auth flow");
    } else {
      console.log("Auth flow failed:", result);
    }
  }

  useEffect(() => {
    WebBrowser.warmUpAsync();

    return () => {
      WebBrowser.coolDownAsync();
    };
  }, []);

  return (
    <TouchableOpacity
      onPress={onSignInButtonPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: "#dbdbdb",
        borderRadius: 4,
        paddingVertical: 10,
        paddingHorizontal: 15,
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      }}
      activeOpacity={0.8}
    >
      <Image
        source={{
          uri: "https://developers.google.com/identity/images/g-logo.png",
        }}
        style={{ width: 24, height: 24, marginRight: 10 }}
      />
      <Text
        style={{
          fontSize: 16,
          color: "#757575",
          fontWeight: "500",
        }}
      >
        Sign in with Google
      </Text>
    </TouchableOpacity>
  );
}

import { useState } from "react";
import {
  TextInput,
  TouchableOpacity,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import GoogleSignInButton from "../components/social-auth-buttons/google/google-sign-in-button";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!email || !password) return alert("Please fill in all fields");

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }
    router.replace("/(tabs)");
  };

  const onLoginWithGoogle = async () => {
    // Generate a redirect URL that works for your specific environment
    const redirectTo = Linking.createURL("/(tabs)");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: false,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <ThemedView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            showsVerticalScrollIndicator={false}
            className="px-8"
          >
            {/* Header Section */}
            <View className="mb-10">
              <ThemedText
                type="title"
                className="text-4xl mt-20 font-extrabold text-gray-900 tracking-tight"
              >
                Welcome Back
              </ThemedText>
              <ThemedText className="text-gray-500 text-lg mt-2">
                Good to see you again.
              </ThemedText>
            </View>

            {/* Form Section */}
            <View className="space-y-4">
              <View>
                <Text className="text-gray-700 font-medium mb-2 ml-1">
                  Email Address
                </Text>
                <TextInput
                  placeholder="name@example.com"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  className="bg-gray-50 rounded-2xl px-5 py-4 text-gray-900 text-base border border-gray-100"
                />
              </View>

              <View className="mt-4">
                <Text className="text-gray-700 font-medium mb-2 ml-1">
                  Password
                </Text>
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  className="bg-gray-50 rounded-2xl px-5 py-4 text-gray-900 text-base border border-gray-100"
                />
              </View>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              onPress={onLogin}
              disabled={loading}
              activeOpacity={0.8}
              className={`rounded-2xl py-4 mt-8 flex-row justify-center items-center ${
                loading ? "bg-green-400" : "bg-green-600"
              }`}
            >
              {loading && <ActivityIndicator color="white" className="mr-2" />}
              <Text className="text-white font-bold text-lg">
                {loading ? "Signing in..." : "Login"}
              </Text>
            </TouchableOpacity>

            <View className="flex-row items-center my-8">
              <View className="h-[1px] bg-gray-200 flex-1" />
              <Text className="text-gray-400 mx-4 font-medium">OR</Text>
              <View className="h-[1px] bg-gray-200 flex-1" />
            </View>

            {/* Google Login */}
            <GoogleSignInButton />

            {/* Footer */}
            <View className="flex-row justify-center mt-auto py-6">
              <Text className="text-gray-500 text-base">
                Don't have an account?
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/register")}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text className="text-green-600 font-bold text-base">
                  {" "}
                  Sign up
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

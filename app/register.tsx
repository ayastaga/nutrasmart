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
} from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSignUp = async () => {
    if (!email || !password || !fullName) {
      return alert("Please fill in all fields");
    }

    setLoading(true);
    const {
      data: { session },
      error,
    } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    // If Supabase is set to 'Confirm Email', session might be null initially
    if (!session) {
      alert("Please check your inbox for a confirmation email!");
      router.replace("/login");
    } else {
      router.replace("/(tabs)");
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
                Create Account
              </ThemedText>
              <ThemedText className="text-gray-500 text-lg mt-2">
                Join us and start your journey.
              </ThemedText>
            </View>

            {/* Form Section */}
            <View className="space-y-4">
              <View>
                <Text className="text-gray-700 font-medium mb-2 ml-1">
                  Full Name
                </Text>
                <TextInput
                  placeholder="John Doe"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  value={fullName}
                  onChangeText={setFullName}
                  className="bg-gray-50 rounded-2xl px-5 py-4 text-gray-900 text-base border border-gray-100"
                />
              </View>

              <View className="mt-4">
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
                  placeholder="Create a password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  className="bg-gray-50 rounded-2xl px-5 py-4 text-gray-900 text-base border border-gray-100"
                />
              </View>
            </View>

            {/* Register Button */}
            <TouchableOpacity
              onPress={onSignUp}
              disabled={loading}
              activeOpacity={0.8}
              className={`rounded-2xl py-4 mt-8 flex-row justify-center items-center ${
                loading ? "bg-green-400" : "bg-green-600"
              }`}
            >
              {loading && <ActivityIndicator color="white" className="mr-2" />}
              <Text className="text-white font-bold text-lg">
                {loading ? "Creating account..." : "Sign Up"}
              </Text>
            </TouchableOpacity>

            {/* Footer */}
            <View className="flex-row justify-center mt-auto py-6">
              <Text className="text-gray-500 text-base">
                Already have an account?
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/login")}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text className="text-green-600 font-bold text-base">
                  {" "}
                  Login
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

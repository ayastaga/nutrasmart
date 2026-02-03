import { useState } from "react";
import { StyleSheet, TextInput, Button, Alert } from "react-native";
import { Stack, router } from "expo-router";

import { supabase } from "@/lib/supabase.web";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert("Login failed", error.message);
      return;
    }

    // ✅ AuthProvider will detect the session change
    router.replace("/(tabs)");
  };

  return (
    <>
      <Stack.Screen options={{ title: "Login" }} />

      <ThemedView style={styles.container}>
        <ThemedText type="title">Login</ThemedText>

        <TextInput
          placeholder="Email"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />

        <TextInput
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />

        <Button
          title={loading ? "Logging in..." : "Login"}
          onPress={onLogin}
          disabled={loading}
        />
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
});

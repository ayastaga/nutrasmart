// sign-out-button.tsx
import { supabase } from "../../lib/supabase.web";
import React from "react";
import { Button } from "react-native";

async function onSignOutButtonPress() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Error signing out:", error);
  }
}

export default function SignOutButton() {
  return <Button title="Sign out" onPress={onSignOutButtonPress} />;
}

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  FlatList,
  useColorScheme,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useAuthContext } from "@/hooks/use-auth-context";
import { supabase } from "@/lib/supabase";
import {
  User,
  Mail,
  Lock,
  Globe,
  Camera,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  LogOut,
  Trash2,
  Image as ImageIcon,
} from "lucide-react-native";
import { uploadAvatarApi } from "@/lib/api";

interface ProfileData {
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  username: string | null;
  bio: string | null;
}
import { UploadedFile } from "@/lib/api";

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { session } = useAuthContext();
  const user = session?.user;

  // Profile state
  const [profile, setProfile] = useState<ProfileData>({
    full_name: null,
    email: null,
    avatar_url: null,
    username: null,
    bio: null,
  });

  // Form state
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showImageSourcePicker, setShowImageSourcePicker] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setFullName(data.full_name || "");
        setUsername(data.username || "");
        setBio(data.bio || "");
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      Alert.alert("Error", "Failed to load profile data");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;

    try {
      setSaving(true);

      const updates = {
        id: user.id,
        full_name: fullName.trim() || null,
        username: username.trim() || null,
        bio: bio.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("profiles").upsert(updates);

      if (error) throw error;

      setProfile((prev) => ({ ...prev, ...updates }));
      Alert.alert("Success", "Profile updated successfully!");
      setExpandedSection(null);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      Alert.alert("Error", error.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all password fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      Alert.alert("Success", "Password updated successfully!");
      setNewPassword("");
      setConfirmPassword("");
      setExpandedSection(null);
    } catch (error: any) {
      console.error("Error updating password:", error);
      Alert.alert("Error", error.message || "Failed to update password");
    } finally {
      setSaving(false);
    }
  };

  const handleImageSourceSelection = (source: "camera" | "library") => {
    setShowImageSourcePicker(false);
    if (source === "camera") {
      handleTakePhoto();
    } else {
      handlePickAvatar();
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Please grant camera access to take a photo",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Failed to take photo");
    }
  };

  const handlePickAvatar = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Please grant photo library access to change your avatar",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  // Inside ProfileScreen component
  const uploadAvatar = async (uri: string) => {
    if (!user?.id) return;

    try {
      setUploadingAvatar(true);

      // Pass 2 arguments: the image URI and the userId
      const fileData: UploadedFile = await uploadAvatarApi(uri, user.id);

      // Update the database
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          avatar_url: fileData.url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Update UI
      setProfile((prev) => ({ ...prev, avatar_url: fileData.url }));
      Alert.alert("Success", "Avatar updated successfully!");
    } catch (error: any) {
      console.error("Upload failed:", error);
      Alert.alert("Error", error.message || "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.id || !profile.avatar_url) return;

    Alert.alert(
      "Remove Avatar",
      "Are you sure you want to remove your profile picture?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setUploadingAvatar(true);

              const { error } = await supabase
                .from("profiles")
                .update({
                  avatar_url: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", user.id);

              if (error) throw error;

              setProfile((prev) => ({ ...prev, avatar_url: null }));
              Alert.alert("Success", "Avatar removed successfully!");
            } catch (error: any) {
              console.error("Error removing avatar:", error);
              Alert.alert("Error", "Failed to remove avatar");
            } finally {
              setUploadingAvatar(false);
            }
          },
        },
      ],
    );
  };

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await supabase.auth.signOut();
          } catch (error) {
            console.error("Error signing out:", error);
            Alert.alert("Error", "Failed to sign out");
          }
        },
      },
    ]);
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (loading) {
    return (
      <View
        className={`flex-1 justify-center items-center ${isDark ? "bg-black" : "bg-white"}`}
      >
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        className={`flex-1 ${isDark ? "bg-black" : "bg-white"}`}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View
          className={`px-6 pt-16 pb-8 ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
        >
          <Text
            className={`text-3xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}
          >
            Profile Settings
          </Text>
        </View>

        {/* Avatar Section */}
        <View className="px-6 py-6 items-center">
          <TouchableOpacity
            onPress={() => setShowImageSourcePicker(true)}
            disabled={uploadingAvatar}
            className="relative"
          >
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                className="w-32 h-32 rounded-full"
              />
            ) : (
              <View
                className={`w-32 h-32 rounded-full items-center justify-center ${isDark ? "bg-gray-800" : "bg-gray-200"}`}
              >
                <User size={48} color={isDark ? "#9ca3af" : "#6b7280"} />
              </View>
            )}

            {uploadingAvatar ? (
              <View className="absolute inset-0 bg-black/50 rounded-full items-center justify-center">
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <View className="absolute bottom-0 right-0 bg-blue-500 rounded-full p-2">
                <Camera size={20} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {profile.avatar_url && (
            <TouchableOpacity
              onPress={handleRemoveAvatar}
              className="mt-3 flex-row items-center gap-1"
            >
              <Trash2 size={14} color="#ef4444" />
              <Text className="text-red-500 text-sm">Remove photo</Text>
            </TouchableOpacity>
          )}

          <Text
            className={`mt-4 text-xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}
          >
            {profile.full_name || "Anonymous User"}
          </Text>
          {profile.username && (
            <Text
              className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
            >
              @{profile.username}
            </Text>
          )}
        </View>

        {/* Personal Information */}
        <View className="px-6 mt-4">
          <TouchableOpacity
            onPress={() => toggleSection("personal")}
            className={`p-4 rounded-lg flex-row items-center justify-between ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
          >
            <View className="flex-row items-center gap-3">
              <User size={20} color={isDark ? "#9ca3af" : "#6b7280"} />
              <Text
                className={`text-base font-medium ${isDark ? "text-white" : "text-gray-900"}`}
              >
                Personal Information
              </Text>
            </View>
            <ChevronRight
              size={20}
              color={isDark ? "#9ca3af" : "#6b7280"}
              style={{
                transform: [
                  { rotate: expandedSection === "personal" ? "90deg" : "0deg" },
                ],
              }}
            />
          </TouchableOpacity>

          {expandedSection === "personal" && (
            <View
              className={`mt-3 p-4 rounded-lg ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
            >
              <Text
                className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
              >
                Full Name
              </Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                className={`p-3 rounded-lg mb-4 ${isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900"}`}
              />

              <Text
                className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
              >
                Username
              </Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Choose a username"
                placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                autoCapitalize="none"
                className={`p-3 rounded-lg mb-4 ${isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900"}`}
              />

              <Text
                className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
              >
                Bio
              </Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself"
                placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                multiline
                numberOfLines={3}
                className={`p-3 rounded-lg mb-4 ${isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900"}`}
                style={{ textAlignVertical: "top" }}
              />

              <TouchableOpacity
                onPress={handleSaveProfile}
                disabled={saving}
                className="bg-blue-500 p-3 rounded-lg flex-row items-center justify-center gap-2"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Save size={18} color="#fff" />
                    <Text className="text-white font-medium">Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Email (Read-only) */}
        <View className="px-6 mt-4">
          <View
            className={`p-4 rounded-lg ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
          >
            <View className="flex-row items-center gap-3 mb-2">
              <Mail size={20} color={isDark ? "#9ca3af" : "#6b7280"} />
              <Text
                className={`text-base font-medium ${isDark ? "text-white" : "text-gray-900"}`}
              >
                Email
              </Text>
            </View>
            <Text
              className={`ml-8 ${isDark ? "text-gray-400" : "text-gray-600"}`}
            >
              {profile.email || user?.email || "No email"}
            </Text>
            <Text
              className={`ml-8 mt-1 text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}
            >
              Email cannot be changed
            </Text>
          </View>
        </View>

        {/* Password */}
        <View className="px-6 mt-4">
          <TouchableOpacity
            onPress={() => toggleSection("password")}
            className={`p-4 rounded-lg flex-row items-center justify-between ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
          >
            <View className="flex-row items-center gap-3">
              <Lock size={20} color={isDark ? "#9ca3af" : "#6b7280"} />
              <Text
                className={`text-base font-medium ${isDark ? "text-white" : "text-gray-900"}`}
              >
                Change Password
              </Text>
            </View>
            <ChevronRight
              size={20}
              color={isDark ? "#9ca3af" : "#6b7280"}
              style={{
                transform: [
                  { rotate: expandedSection === "password" ? "90deg" : "0deg" },
                ],
              }}
            />
          </TouchableOpacity>

          {expandedSection === "password" && (
            <View
              className={`mt-3 p-4 rounded-lg ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
            >
              <Text
                className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
              >
                New Password
              </Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new password"
                placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                secureTextEntry
                className={`p-3 rounded-lg mb-4 ${isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900"}`}
              />

              <Text
                className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
              >
                Confirm New Password
              </Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                secureTextEntry
                className={`p-3 rounded-lg mb-4 ${isDark ? "bg-gray-800 text-white" : "bg-white text-gray-900"}`}
              />

              <TouchableOpacity
                onPress={handleChangePassword}
                disabled={saving}
                className="bg-blue-500 p-3 rounded-lg flex-row items-center justify-center gap-2"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Save size={18} color="#fff" />
                    <Text className="text-white font-medium">
                      Update Password
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Sign Out */}
        <View className="px-6 mt-6 mb-8">
          <TouchableOpacity
            onPress={handleSignOut}
            className="bg-red-500/10 p-4 rounded-lg flex-row items-center justify-center gap-2 border border-red-500/20"
          >
            <LogOut size={20} color="#ef4444" />
            <Text className="text-red-500 font-medium text-base">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Image Source Picker Modal */}
      <Modal
        visible={showImageSourcePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageSourcePicker(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View
            className={`w-[80%] rounded-2xl overflow-hidden ${isDark ? "bg-gray-900" : "bg-white"}`}
          >
            <View className="p-4 border-b border-gray-200 dark:border-gray-700">
              <Text
                className={`text-lg font-semibold text-center ${isDark ? "text-white" : "text-gray-900"}`}
              >
                Choose Photo Source
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => handleImageSourceSelection("camera")}
              className={`p-4 flex-row items-center gap-3 border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}
            >
              <Camera size={24} color={isDark ? "#9ca3af" : "#6b7280"} />
              <Text
                className={`text-base ${isDark ? "text-white" : "text-gray-900"}`}
              >
                Take Photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleImageSourceSelection("library")}
              className="p-4 flex-row items-center gap-3"
            >
              <ImageIcon size={24} color={isDark ? "#9ca3af" : "#6b7280"} />
              <Text
                className={`text-base ${isDark ? "text-white" : "text-gray-900"}`}
              >
                Choose from Library
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowImageSourcePicker(false)}
              className={`p-4 border-t ${isDark ? "border-gray-800" : "border-gray-200"}`}
            >
              <Text className="text-base text-red-500 text-center font-medium">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

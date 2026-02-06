import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Dimensions,
  RefreshControl,
  Animated,
  useColorScheme,
  Alert,
  TextInput,
} from "react-native";
import { supabase } from "../../lib/supabase.web";
import { useAuthContext } from "@/hooks/use-auth-context";
import { useTimezoneStore, COMMON_TIMEZONES } from "@/hooks/use-timezone";
import {
  format,
  subDays,
  parseISO,
  startOfDay,
  eachDayOfInterval,
  differenceInDays,
} from "date-fns";
import {
  LineChart,
  BarChart,
  PieChart,
  StackedBarChart,
} from "react-native-chart-kit";
import {
  Calendar,
  TrendingUp,
  Activity,
  Target,
  Clock,
  Utensils,
  Eye,
  X,
  CalendarDays,
  ChevronDown,
  Globe,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar as RNCalendar } from "react-native-calendars";
import { Edit2, Trash2, Save, Camera } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { formatInTimeZone } from "date-fns-tz";

interface NutritionSummary {
  date?: string;
  week_start?: string;
  month_start?: string;
  year_start?: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number;
  total_sodium: number;
  meal_count: number;
  days_logged?: number;
  avg_daily_calories?: number;
}

interface Meal {
  id: string;
  meal_name: string;
  meal_type: string;
  logged_at: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber?: number;
  total_sodium?: number;
  image_url?: string;
  description?: string;
  meal_dishes: any[];
}

const MEAL_TYPE_COLORS = {
  breakfast: { light: "bg-orange-100", dark: "bg-orange-900/30" },
  lunch: { light: "bg-blue-100", dark: "bg-blue-900/30" },
  dinner: { light: "bg-green-100", dark: "bg-green-900/30" },
  snack: { light: "bg-purple-100", dark: "bg-purple-900/30" },
  other: { light: "bg-gray-100", dark: "bg-gray-800/30" },
};

const MEAL_TYPE_TEXT_COLORS = {
  breakfast: { light: "text-orange-800", dark: "text-orange-300" },
  lunch: { light: "text-blue-800", dark: "text-blue-300" },
  dinner: { light: "text-green-800", dark: "text-green-300" },
  snack: { light: "text-purple-800", dark: "text-purple-300" },
  other: { light: "text-gray-800", dark: "text-gray-300" },
};

const MAX_DAILY_CHART_POINTS = 29; // Allow up to 29 days in daily view (disables 30-day and 90-day buttons)

// Animated Card Component
const AnimatedCard = ({ children, delay = 0, className = "" }: any) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
      className={className}
    >
      {children}
    </Animated.View>
  );
};

export default function ProfileScreen() {
  const { session } = useAuthContext();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const {
    timezone: storedTimezone,
    isAutoDetect,
    getCurrentTimezone,
    setTimezone,
    resetToAuto,
  } = useTimezoneStore();
  const userTimezone = getCurrentTimezone();
  const screenWidth = Dimensions.get("window").width;

  const [period, setPeriod] = useState<
    "daily" | "weekly" | "monthly" | "yearly"
  >("daily");
  const [summaryData, setSummaryData] = useState<NutritionSummary[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "calories" | "macros" | "distribution" | "meals"
  >("calories");
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarSelection, setCalendarSelection] = useState<{
    start?: string;
    end?: string;
  }>({});
  const [showTimezonePicker, setShowTimezonePicker] = useState(false);

  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editForm, setEditForm] = useState({
    meal_name: "",
    meal_type: "",
    description: "",
    total_calories: "",
    total_protein: "",
    total_carbs: "",
    total_fat: "",
    total_fiber: "",
    total_sodium: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const convertUTCToLocal = (utcDateString: string) => {
    const date = new Date(utcDateString);
    return date.toLocaleDateString("en-CA", {
      timeZone: userTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const formatDateTimeLocal = (utcDateString: string, formatStr: string) => {
    if (!utcDateString) return "Invalid date";

    try {
      const date = new Date(utcDateString);

      if (isNaN(date.getTime())) {
        console.error("Invalid date:", utcDateString);
        return "Invalid date";
      }

      return formatInTimeZone(date, userTimezone, formatStr);
    } catch (error) {
      console.error("Date formatting error:", error, utcDateString);
      return "Invalid date";
    }
  };

  const quickRanges = [
    { label: "Last 7 days", from: subDays(new Date(), 6) }, // 7 days total
    { label: "Last 30 days", from: subDays(new Date(), 29) }, // 30 days total
    { label: "Last 90 days", from: subDays(new Date(), 89) }, // 90 days total
  ];

  const isRangeDisabled = (from: Date, to: Date) => {
    if (period !== "daily") return false;
    const days = differenceInDays(to, from) + 1; // inclusive
    console.log("🔍 Checking range:", {
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
      days,
      disabled: days > MAX_DAILY_CHART_POINTS,
    });
    return days > MAX_DAILY_CHART_POINTS; // Allow up to 30 days, disable 31+
  };

  const isCustomRangeDisabled = () => {
    // Custom range button should be disabled when viewing daily (since daily only allows up to 30 days)
    return period === "daily";
  };

  const [dateRange, setDateRange] = useState({
    from: subDays(new Date(), 6),
    to: new Date(),
  });

  const fetchNutritionSummary = async () => {
    if (!session?.user) return;

    setIsLoading(true);
    try {
      const startDate = format(startOfDay(dateRange.from), "yyyy-MM-dd");
      const endDate = format(startOfDay(dateRange.to), "yyyy-MM-dd");

      console.log("📊 Fetching nutrition summary:", {
        period,
        startDate,
        endDate,
        userTimezone,
      });

      if (period === "daily") {
        const { data: mealsData, error } = await supabase
          .from("meals")
          .select(
            "id, logged_at, total_calories, total_protein, total_carbs, total_fat, total_fiber, total_sodium",
          )
          .eq("user_id", session.user.id)
          .order("logged_at", { ascending: false });

        if (error) {
          console.error("❌ Error fetching meals:", error);
          throw error;
        }

        console.log("✅ Fetched all meals:", mealsData?.length);

        const dailyMap = new Map<string, NutritionSummary>();

        const allDates = eachDayOfInterval({
          start: startOfDay(dateRange.from),
          end: startOfDay(dateRange.to),
        });

        allDates.forEach((date) => {
          const localDateStr = format(date, "yyyy-MM-dd");
          dailyMap.set(localDateStr, {
            date: localDateStr,
            total_calories: 0,
            total_protein: 0,
            total_carbs: 0,
            total_fat: 0,
            total_fiber: 0,
            total_sodium: 0,
            meal_count: 0,
          });
        });

        // UPDATED: Convert UTC to local timezone
        mealsData?.forEach((meal) => {
          const localDateStr = convertUTCToLocal(meal.logged_at);

          if (localDateStr >= startDate && localDateStr <= endDate) {
            if (!dailyMap.has(localDateStr)) {
              dailyMap.set(localDateStr, {
                date: localDateStr,
                total_calories: 0,
                total_protein: 0,
                total_carbs: 0,
                total_fat: 0,
                total_fiber: 0,
                total_sodium: 0,
                meal_count: 0,
              });
            }

            const dayData = dailyMap.get(localDateStr)!;
            dayData.total_calories += meal.total_calories || 0;
            dayData.total_protein += meal.total_protein || 0;
            dayData.total_carbs += meal.total_carbs || 0;
            dayData.total_fat += meal.total_fat || 0;
            dayData.total_fiber += meal.total_fiber || 0;
            dayData.total_sodium += meal.total_sodium || 0;
            dayData.meal_count += 1;
          }
        });

        const data = Array.from(dailyMap.values()).sort((a, b) =>
          a.date!.localeCompare(b.date!),
        );

        console.log("📈 Daily summary data:", data.length, "days");
        setSummaryData(data);
      } else {
        const functionName = `get_${period}_nutrition_summary`;
        console.log("🔧 Calling RPC function:", functionName);

        const { data, error } = await supabase.rpc(functionName, {
          p_user_id: session.user.id,
          p_start_date: startDate,
          p_end_date: endDate,
          p_limit: 365,
        });

        if (error) {
          console.error("❌ RPC error:", error);
          throw error;
        }

        console.log("✅ RPC data:", data?.length);
        setSummaryData(data || []);
      }
    } catch (error) {
      console.error("Error fetching nutrition summary:", error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  // Watch for timezone changes
  useEffect(() => {
    if (session?.user) {
      console.log("🌍 Timezone changed to:", userTimezone);
      fetchNutritionSummary();
      fetchMeals();
    }
  }, [userTimezone]);

  const renderTimezoneModal = () => {
    const currentSystemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const groupedTimezones = COMMON_TIMEZONES.reduce(
      (acc, tz) => {
        if (!acc[tz.region]) acc[tz.region] = [];
        acc[tz.region].push(tz);
        return acc;
      },
      {} as Record<string, typeof COMMON_TIMEZONES>,
    );

    return (
      <Modal
        visible={showTimezonePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimezonePicker(false)}
      >
        <View
          className={`flex-1 ${isDark ? "bg-black/70" : "bg-black/50"} justify-end`}
        >
          <View
            className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-t-3xl p-6 max-h-[80%]`}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text
                className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}
              >
                Select Timezone
              </Text>
              <TouchableOpacity onPress={() => setShowTimezonePicker(false)}>
                <X size={24} color={isDark ? "#d1d5db" : "#6b7280"} />
              </TouchableOpacity>
            </View>

            {isAutoDetect && (
              <View
                className={`mb-4 p-3 rounded-lg ${isDark ? "bg-green-900/30" : "bg-green-100"}`}
              >
                <Text
                  className={`text-sm font-medium ${isDark ? "text-green-400" : "text-green-700"}`}
                >
                  🌍 Auto-detecting: {currentSystemTz}
                </Text>
                <Text
                  className={`text-xs mt-1 ${isDark ? "text-green-300" : "text-green-600"}`}
                >
                  Your timezone is automatically detected from your device
                </Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} className="mb-4">
              {Object.entries(groupedTimezones).map(([region, timezones]) => (
                <View key={region} className="mb-4">
                  <Text
                    className={`text-xs font-bold mb-2 ${isDark ? "text-gray-500" : "text-gray-400"} uppercase`}
                  >
                    {region}
                  </Text>
                  {timezones.map((tz) => {
                    const isSelected =
                      (tz.value === "auto" && isAutoDetect) ||
                      (tz.value === storedTimezone && !isAutoDetect);

                    return (
                      <TouchableOpacity
                        key={tz.value}
                        onPress={() => {
                          if (tz.value === "auto") {
                            resetToAuto();
                          } else {
                            setTimezone(tz.value);
                          }
                          setShowTimezonePicker(false);
                        }}
                        className={`p-4 rounded-lg mb-2 ${
                          isSelected
                            ? isDark
                              ? "bg-green-900/30"
                              : "bg-green-100"
                            : isDark
                              ? "bg-gray-800"
                              : "bg-gray-100"
                        }`}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1">
                            <Text
                              className={`font-medium ${
                                isSelected
                                  ? isDark
                                    ? "text-green-400"
                                    : "text-green-700"
                                  : isDark
                                    ? "text-white"
                                    : "text-gray-900"
                              }`}
                            >
                              {tz.label}
                            </Text>
                            {tz.value !== "auto" && (
                              <Text
                                className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}
                              >
                                {tz.value}
                              </Text>
                            )}
                          </View>
                          {isSelected && (
                            <View className="w-5 h-5 rounded-full bg-green-600 items-center justify-center">
                              <Text className="text-white text-xs">✓</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // Fixed fetchMeals function - replace in your ProfileScreen

  const fetchMeals = async () => {
    if (!session?.user) {
      console.log("❌ No session, skipping fetchMeals");
      return;
    }

    try {
      const startDate = format(startOfDay(dateRange.from), "yyyy-MM-dd");
      const endDate = format(startOfDay(dateRange.to), "yyyy-MM-dd");

      console.log("🍽️ Fetching meals with params:", {
        startDate,
        endDate,
        userId: session.user.id,
        timezone: userTimezone,
      });

      // Fetch ALL meals, then filter client-side for accurate timezone handling
      const { data, error } = await supabase
        .from("meals")
        .select("*, meal_dishes(*)")
        .eq("user_id", session.user.id)
        .order("logged_at", { ascending: false });

      if (error) {
        console.error("❌ Error fetching meals:", error);
        throw error;
      }

      console.log("📊 Total meals in database:", data?.length);

      // Filter by date range using user's timezone
      const filteredMeals =
        data?.filter((meal) => {
          const localDateStr = convertUTCToLocal(meal.logged_at);
          const isInRange =
            localDateStr >= startDate && localDateStr <= endDate;

          if (!isInRange) {
            console.log(
              `📍 Meal "${meal.meal_name}" at ${localDateStr} is outside range ${startDate} to ${endDate}`,
            );
          }

          return isInRange;
        }) || [];

      console.log("✅ Filtered meals count:", filteredMeals.length);
      setMeals(filteredMeals);
    } catch (error) {
      console.error("❌ Error fetching meals:", error);
      setMeals([]);
    }
  };

  useEffect(() => {
    if (session?.user) {
      fetchNutritionSummary();
      fetchMeals();
    }
  }, [period, dateRange, session]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNutritionSummary();
    fetchMeals();
  };

  const getTotalStats = () => {
    return summaryData.reduce(
      (acc, item) => ({
        totalCalories: acc.totalCalories + Number(item.total_calories),
        totalProtein: acc.totalProtein + Number(item.total_protein),
        totalCarbs: acc.totalCarbs + Number(item.total_carbs),
        totalFat: acc.totalFat + Number(item.total_fat),
        totalMeals: acc.totalMeals + Number(item.meal_count),
        daysLogged: acc.daysLogged + (Number(item.meal_count) > 0 ? 1 : 0),
      }),
      {
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        totalMeals: 0,
        daysLogged: 0,
      },
    );
  };

  const openEditModal = (meal: Meal) => {
    setEditingMeal(meal);
    setEditForm({
      meal_name: meal.meal_name,
      meal_type: meal.meal_type,
      description: meal.description || "",
      total_calories: meal.total_calories.toString(),
      total_protein: meal.total_protein.toString(),
      total_carbs: meal.total_carbs.toString(),
      total_fat: meal.total_fat.toString(),
      total_fiber: (meal.total_fiber || 0).toString(),
      total_sodium: (meal.total_sodium || 0).toString(),
    });
  };

  const closeEditModal = () => {
    setEditingMeal(null);
    setEditForm({
      meal_name: "",
      meal_type: "",
      description: "",
      total_calories: "",
      total_protein: "",
      total_carbs: "",
      total_fat: "",
      total_fiber: "",
      total_sodium: "",
    });
  };

  const handleSaveMeal = async () => {
    if (!editingMeal) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("meals")
        .update({
          meal_name: editForm.meal_name,
          meal_type: editForm.meal_type,
          description: editForm.description,
          total_calories: parseFloat(editForm.total_calories) || 0,
          total_protein: parseFloat(editForm.total_protein) || 0,
          total_carbs: parseFloat(editForm.total_carbs) || 0,
          total_fat: parseFloat(editForm.total_fat) || 0,
          total_fiber: parseFloat(editForm.total_fiber) || 0,
          total_sodium: parseFloat(editForm.total_sodium) || 0,
        })
        .eq("id", editingMeal.id);

      if (error) throw error;

      Alert.alert("Success", "Meal updated successfully!");
      closeEditModal();
      fetchMeals();
      fetchNutritionSummary();
    } catch (error) {
      console.error("Error updating meal:", error);
      Alert.alert("Error", "Failed to update meal");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMeal = async () => {
    if (!editingMeal) return;

    Alert.alert("Delete Meal", "Are you sure you want to delete this meal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            console.log("🗑️ Deleting meal via edge function:", editingMeal.id);

            // Get the session (includes access_token)
            const {
              data: { session },
              error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError || !session) {
              throw new Error("Not authenticated");
            }

            console.log("📝 Token exists:", !!session.access_token);

            // Include the JWT in the Authorization header
            const { data, error } = await supabase.functions.invoke(
              "delete-meal",
              {
                body: { mealId: editingMeal.id },
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              },
            );

            console.log("📡 Response:", { data, error });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || "Delete failed");

            Alert.alert("Success", "Meal deleted successfully!");
            closeEditModal();

            await Promise.all([fetchMeals(), fetchNutritionSummary()]);
          } catch (error: any) {
            console.error("❌ Error:", error);
            Alert.alert(
              "Error",
              `Failed to delete: ${error.message || "Unknown error"}`,
            );
          }
        },
      },
    ]);
  };

  const handleChangeImage = async () => {
    if (!editingMeal) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera roll permission is required");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      // You would need to implement image upload here
      Alert.alert("Note", "Image upload functionality needs to be implemented");
    }
  };

  const stats = getTotalStats();
  const avgDailyCalories =
    stats.daysLogged > 0
      ? Math.round(stats.totalCalories / stats.daysLogged)
      : 0;

  const formatChartData = () => {
    if (!dateRange.from || !dateRange.to)
      return { labels: [], datasets: [{ data: [0] }] };

    const dataMap = new Map<string, number>();

    summaryData.forEach((item) => {
      const dateKey =
        item.date || item.week_start || item.month_start || item.year_start;
      if (dateKey) {
        const formattedKey = /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
          ? dateKey
          : format(parseISO(dateKey), "yyyy-MM-dd");
        dataMap.set(formattedKey, Number(item.total_calories));
      }
    });

    if (period === "daily") {
      const allDates = eachDayOfInterval({
        start: startOfDay(dateRange.from),
        end: startOfDay(dateRange.to),
      });

      const labelInterval =
        allDates.length > 30 ? Math.ceil(allDates.length / 15) : 1;

      const labels = allDates.map((date, index) => {
        if (index % labelInterval === 0 || index === allDates.length - 1) {
          return format(date, "MM/dd");
        }
        return "";
      });

      const data = allDates.map((date) => {
        const dateKey = format(date, "yyyy-MM-dd");
        return dataMap.get(dateKey) || 0;
      });

      return {
        labels,
        datasets: [{ data: data.length > 0 ? data : [0] }],
      };
    }

    const sortedEntries = Array.from(dataMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    return {
      labels:
        sortedEntries.length > 0
          ? sortedEntries.map(([date]) => format(parseISO(date), "MM/dd"))
          : ["No data"],
      datasets: [
        {
          data:
            sortedEntries.length > 0
              ? sortedEntries.map(([, value]) => value)
              : [0],
        },
      ],
    };
  };

  const formatMacroChartData = () => {
    if (summaryData.length === 0)
      return {
        labels: ["No data"],
        legend: ["Protein", "Carbs", "Fat"],
        data: [[0], [0], [0]],
        barColors: ["#3b82f6", "#22c55e", "#f59e0b"],
      };

    const recentData = summaryData.slice(0, 7).reverse();

    // StackedBarChart expects data in format: [[p1, p2, p3...], [c1, c2, c3...], [f1, f2, f3...]]
    const proteinData = recentData.map((item) =>
      Math.round(Number(item.total_protein)),
    );
    const carbsData = recentData.map((item) =>
      Math.round(Number(item.total_carbs)),
    );
    const fatData = recentData.map((item) =>
      Math.round(Number(item.total_fat)),
    );

    return {
      labels: recentData.map((item) => {
        const dateKey = item.date || item.week_start || item.month_start;
        return dateKey ? format(parseISO(dateKey), "MM/dd") : "";
      }),
      legend: ["Protein", "Carbs", "Fat"],
      data: [proteinData, carbsData, fatData],
      barColors: ["#3b82f6", "#22c55e", "#f59e0b"],
    };
  };

  const getPieChartData = () => {
    const totals = getTotalStats();
    const data = [
      {
        name: "Protein",
        population: Math.round(totals.totalProtein * 4), // 4 cal/g
        color: "#3b82f6",
        legendFontColor: isDark ? "#d1d5db" : "#7F7F7F",
      },
      {
        name: "Carbs",
        population: Math.round(totals.totalCarbs * 4), // 4 cal/g
        color: "#22c55e",
        legendFontColor: isDark ? "#d1d5db" : "#7F7F7F",
      },
      {
        name: "Fat",
        population: Math.round(totals.totalFat * 9), // 9 cal/g
        color: "#f59e0b",
        legendFontColor: isDark ? "#d1d5db" : "#7F7F7F",
      },
    ].filter((item) => item.population > 0);

    if (data.length === 0) {
      return [
        {
          name: "No data",
          population: 1,
          color: "#E5E7EB",
          legendFontColor: isDark ? "#d1d5db" : "#7F7F7F",
        },
      ];
    }

    return data;
  };

  const handleCalendarDayPress = (day: any) => {
    if (!calendarSelection.start || calendarSelection.end) {
      setCalendarSelection({ start: day.dateString, end: undefined });
    } else {
      const start = new Date(calendarSelection.start);
      const end = new Date(day.dateString);

      if (end >= start) {
        setCalendarSelection({
          start: calendarSelection.start,
          end: day.dateString,
        });
      } else {
        setCalendarSelection({
          start: day.dateString,
          end: calendarSelection.start,
        });
      }
    }
  };

  const applyCalendarSelection = () => {
    if (calendarSelection.start && calendarSelection.end) {
      const newFrom = new Date(calendarSelection.start);
      const newTo = new Date(calendarSelection.end);

      if (isRangeDisabled(newFrom, newTo)) {
        alert(
          `Date range too large for daily view. Maximum ${MAX_DAILY_CHART_POINTS} days allowed. Please switch to Weekly, Monthly, or Yearly view for larger ranges.`,
        );
        return;
      }

      setDateRange({ from: newFrom, to: newTo });
      setShowCalendar(false);
      setCalendarSelection({});
    }
  };

  const getMarkedDates = () => {
    if (!calendarSelection.start) return {};

    const marked: any = {};

    if (calendarSelection.start && !calendarSelection.end) {
      marked[calendarSelection.start] = {
        selected: true,
        startingDay: true,
        color: "#22c55e",
        textColor: "white",
      };
    } else if (calendarSelection.start && calendarSelection.end) {
      const start = new Date(calendarSelection.start);
      const end = new Date(calendarSelection.end);
      const days = eachDayOfInterval({ start, end });

      days.forEach((day, index) => {
        const dateString = format(day, "yyyy-MM-dd");
        marked[dateString] = {
          selected: true,
          color: "#22c55e",
          textColor: "white",
          startingDay: index === 0,
          endingDay: index === days.length - 1,
        };
      });
    }

    return marked;
  };

  const renderCalendarModal = () => (
    <Modal
      visible={showCalendar}
      transparent
      animationType="slide"
      onRequestClose={() => setShowCalendar(false)}
    >
      <View
        className={`flex-1 ${isDark ? "bg-black/70" : "bg-black/50"} justify-end`}
      >
        <View
          className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-t-3xl p-6 max-h-[80%]`}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text
              className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}
            >
              Select Date Range
            </Text>
            <TouchableOpacity onPress={() => setShowCalendar(false)}>
              <X size={24} color={isDark ? "#d1d5db" : "#6b7280"} />
            </TouchableOpacity>
          </View>

          <Text
            className={`text-sm mb-4 ${isDark ? "text-gray-400" : "text-gray-600"}`}
          >
            {calendarSelection.start && !calendarSelection.end
              ? "Tap the end date"
              : calendarSelection.start && calendarSelection.end
                ? `${format(new Date(calendarSelection.start), "MMM dd, yyyy")} - ${format(new Date(calendarSelection.end), "MMM dd, yyyy")}`
                : "Tap the start date"}
          </Text>

          <RNCalendar
            markingType="period"
            markedDates={getMarkedDates()}
            onDayPress={handleCalendarDayPress}
            maxDate={format(new Date(), "yyyy-MM-dd")}
            theme={{
              backgroundColor: isDark ? "#1f2937" : "#ffffff",
              calendarBackground: isDark ? "#1f2937" : "#ffffff",
              textSectionTitleColor: isDark ? "#9ca3af" : "#6b7280",
              selectedDayBackgroundColor: "#22c55e",
              selectedDayTextColor: "#ffffff",
              todayTextColor: "#22c55e",
              dayTextColor: isDark ? "#e5e7eb" : "#1f2937",
              textDisabledColor: isDark ? "#4b5563" : "#d1d5db",
              arrowColor: "#22c55e",
              monthTextColor: isDark ? "#f3f4f6" : "#1f2937",
            }}
          />

          <View className="flex-row gap-3 mt-6">
            <TouchableOpacity
              onPress={() => {
                setCalendarSelection({});
                setShowCalendar(false);
              }}
              className={`flex-1 py-3 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-200"}`}
            >
              <Text
                className={`text-center font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={applyCalendarSelection}
              disabled={!calendarSelection.start || !calendarSelection.end}
              className={`flex-1 py-3 rounded-lg ${
                calendarSelection.start && calendarSelection.end
                  ? "bg-green-600"
                  : isDark
                    ? "bg-gray-800"
                    : "bg-gray-300"
              }`}
            >
              <Text
                className={`text-center font-semibold ${
                  calendarSelection.start && calendarSelection.end
                    ? "text-white"
                    : isDark
                      ? "text-gray-600"
                      : "text-gray-500"
                }`}
              >
                Apply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderEditMealModal = () => {
    // Check if any changes have been made
    const hasChanges =
      editingMeal &&
      (editForm.meal_name !== editingMeal.meal_name ||
        editForm.meal_type !== editingMeal.meal_type ||
        editForm.description !== (editingMeal.description || "") ||
        editForm.total_calories !== editingMeal.total_calories.toString() ||
        editForm.total_protein !== editingMeal.total_protein.toString() ||
        editForm.total_carbs !== editingMeal.total_carbs.toString() ||
        editForm.total_fat !== editingMeal.total_fat.toString() ||
        editForm.total_fiber !== (editingMeal.total_fiber || 0).toString() ||
        editForm.total_sodium !== (editingMeal.total_sodium || 0).toString());

    return (
      <Modal
        visible={!!editingMeal}
        transparent
        animationType="slide"
        onRequestClose={closeEditModal}
      >
        <View
          className={`flex-1 ${isDark ? "bg-black/70" : "bg-black/50"} justify-end`}
        >
          <View
            className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-t-3xl p-6 max-h-[90%]`}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View className="flex-row items-center justify-between mb-6">
                <Text
                  className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}
                >
                  Edit Meal
                </Text>
                <TouchableOpacity onPress={closeEditModal}>
                  <X size={24} color={isDark ? "#d1d5db" : "#6b7280"} />
                </TouchableOpacity>
              </View>

              {/* Meal Image */}
              {editingMeal?.image_url && (
                <View className="mb-6">
                  <Image
                    source={{ uri: editingMeal.image_url }}
                    className="w-full h-48 rounded-xl"
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={handleChangeImage}
                    className="absolute bottom-3 right-3 bg-green-600 rounded-full p-3"
                  >
                    <Camera size={20} color="white" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Meal Name */}
              <View className="mb-4">
                <Text
                  className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                >
                  Meal Name
                </Text>
                <TextInput
                  value={editForm.meal_name}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, meal_name: text })
                  }
                  className={`${isDark ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"} px-4 py-3 rounded-lg`}
                  placeholder="e.g., Breakfast Bowl"
                  placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                />
              </View>

              {/* Meal Type */}
              <View className="mb-4">
                <Text
                  className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                >
                  Meal Type
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {["breakfast", "lunch", "dinner", "snack"].map((type) => (
                    <TouchableOpacity
                      key={type}
                      onPress={() =>
                        setEditForm({ ...editForm, meal_type: type })
                      }
                      className={`px-4 py-2 rounded-lg ${
                        editForm.meal_type === type
                          ? "bg-green-600"
                          : isDark
                            ? "bg-gray-800"
                            : "bg-gray-200"
                      }`}
                    >
                      <Text
                        className={`capitalize font-medium ${
                          editForm.meal_type === type
                            ? "text-white"
                            : isDark
                              ? "text-gray-300"
                              : "text-gray-700"
                        }`}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Description */}
              <View className="mb-4">
                <Text
                  className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                >
                  Description
                </Text>
                <TextInput
                  value={editForm.description}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, description: text })
                  }
                  className={`${isDark ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"} px-4 py-3 rounded-lg`}
                  placeholder="Optional description"
                  placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Nutrition Info */}
              <Text
                className={`text-lg font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
              >
                Nutrition Information
              </Text>

              <View className="flex-row flex-wrap gap-3 mb-4">
                <View className="flex-1 min-w-[45%]">
                  <Text
                    className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Calories
                  </Text>
                  <TextInput
                    value={editForm.total_calories}
                    onChangeText={(text) =>
                      setEditForm({ ...editForm, total_calories: text })
                    }
                    keyboardType="numeric"
                    className={`${isDark ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"} px-4 py-3 rounded-lg`}
                    placeholder="0"
                    placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                  />
                </View>

                <View className="flex-1 min-w-[45%]">
                  <Text
                    className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Protein (g)
                  </Text>
                  <TextInput
                    value={editForm.total_protein}
                    onChangeText={(text) =>
                      setEditForm({ ...editForm, total_protein: text })
                    }
                    keyboardType="numeric"
                    className={`${isDark ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"} px-4 py-3 rounded-lg`}
                    placeholder="0"
                    placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                  />
                </View>

                <View className="flex-1 min-w-[45%]">
                  <Text
                    className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Carbs (g)
                  </Text>
                  <TextInput
                    value={editForm.total_carbs}
                    onChangeText={(text) =>
                      setEditForm({ ...editForm, total_carbs: text })
                    }
                    keyboardType="numeric"
                    className={`${isDark ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"} px-4 py-3 rounded-lg`}
                    placeholder="0"
                    placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                  />
                </View>

                <View className="flex-1 min-w-[45%]">
                  <Text
                    className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Fat (g)
                  </Text>
                  <TextInput
                    value={editForm.total_fat}
                    onChangeText={(text) =>
                      setEditForm({ ...editForm, total_fat: text })
                    }
                    keyboardType="numeric"
                    className={`${isDark ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"} px-4 py-3 rounded-lg`}
                    placeholder="0"
                    placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                  />
                </View>

                <View className="flex-1 min-w-[45%]">
                  <Text
                    className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Fiber (g)
                  </Text>
                  <TextInput
                    value={editForm.total_fiber}
                    onChangeText={(text) =>
                      setEditForm({ ...editForm, total_fiber: text })
                    }
                    keyboardType="numeric"
                    className={`${isDark ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"} px-4 py-3 rounded-lg`}
                    placeholder="0"
                    placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                  />
                </View>

                <View className="flex-1 min-w-[45%]">
                  <Text
                    className={`text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                  >
                    Sodium (mg)
                  </Text>
                  <TextInput
                    value={editForm.total_sodium}
                    onChangeText={(text) =>
                      setEditForm({ ...editForm, total_sodium: text })
                    }
                    keyboardType="numeric"
                    className={`${isDark ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"} px-4 py-3 rounded-lg`}
                    placeholder="0"
                    placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
                  />
                </View>
              </View>

              {/* Action Buttons */}
              <View className="flex-row gap-3 mt-6 mb-4">
                <TouchableOpacity
                  onPress={handleDeleteMeal}
                  className={`flex-1 py-3 rounded-lg flex-row items-center justify-center gap-2 ${isDark ? "bg-red-900/30" : "bg-red-100"}`}
                >
                  <Trash2 size={18} color={isDark ? "#fca5a5" : "#dc2626"} />
                  <Text
                    className={`font-semibold ${isDark ? "text-red-400" : "text-red-600"}`}
                  >
                    Delete
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={hasChanges ? handleSaveMeal : closeEditModal}
                  disabled={isSaving}
                  className={`flex-1 py-3 rounded-lg flex-row items-center justify-center gap-2 ${
                    hasChanges
                      ? "bg-green-600"
                      : isDark
                        ? "bg-gray-700"
                        : "bg-gray-200"
                  }`}
                >
                  {isSaving ? (
                    <ActivityIndicator color="white" />
                  ) : hasChanges ? (
                    <>
                      <Save size={18} color="white" />
                      <Text className="text-white font-semibold">
                        Save Changes
                      </Text>
                    </>
                  ) : (
                    <>
                      <X size={18} color={isDark ? "#d1d5db" : "#6b7280"} />
                      <Text
                        className={`font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}
                      >
                        Cancel
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderImageModal = () => (
    <Modal
      visible={!!selectedImage}
      transparent
      animationType="fade"
      onRequestClose={() => setSelectedImage(null)}
    >
      <View className="flex-1 bg-black/90 justify-center items-center">
        <TouchableOpacity
          className="absolute top-12 right-4 z-10 bg-white/20 rounded-full p-2"
          onPress={() => setSelectedImage(null)}
        >
          <X size={24} color="white" />
        </TouchableOpacity>
        {selectedImage && (
          <View className="w-full h-4/5 px-4">
            <Image
              source={{ uri: selectedImage.url }}
              className="w-full h-full"
              resizeMode="contain"
            />
            <Text className="text-white text-center mt-4 text-lg font-semibold">
              {selectedImage.name}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );

  const chartConfig = {
    backgroundColor: isDark ? "#1f2937" : "#ffffff",
    backgroundGradientFrom: isDark ? "#1f2937" : "#ffffff",
    backgroundGradientTo: isDark ? "#1f2937" : "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
    labelColor: (opacity = 1) =>
      isDark ? `rgba(229, 231, 235, ${opacity})` : `rgba(0, 0, 0, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: "4", strokeWidth: "2", stroke: "#22c55e" },
  };

  if (!session?.user) {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? "bg-gray-950" : "bg-white"}`}>
        <View className="flex-1 justify-center items-center">
          <Text
            className={`text-lg ${isDark ? "text-gray-300" : "text-gray-700"}`}
          >
            Please log in
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? "bg-gray-950" : "bg-gray-50"}`}
      edges={["top"]}
    >
      <ScrollView
        className={`flex-1 ${isDark ? "bg-gray-950" : "bg-gray-50"}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {renderImageModal()}
        {renderCalendarModal()}
        {renderTimezoneModal()}

        {/* Header */}
        <AnimatedCard
          className={`${isDark ? "bg-gray-900" : "bg-white"} p-6 border-b ${isDark ? "border-gray-800" : "border-gray-200"}`}
        >
          <Text
            className={`text-3xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}
          >
            Nutrition Profile
          </Text>
          <Text
            className={`${isDark ? "text-gray-400" : "text-gray-600"} mt-1`}
          >
            Track your nutritional intake and progress
          </Text>
          <TouchableOpacity
            onPress={() => setShowTimezonePicker(true)}
            className={`mt-3 p-3 rounded-lg flex-row items-center justify-between ${isDark ? "bg-gray-800" : "bg-gray-100"}`}
          >
            <View className="flex-row items-center gap-2">
              <Globe size={16} color={isDark ? "#9ca3af" : "#6b7280"} />
              <Text
                className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}
              >
                {isAutoDetect ? "🌍 Auto: " : "📍 "}
                {userTimezone}
              </Text>
            </View>
            <ChevronDown size={16} color={isDark ? "#9ca3af" : "#6b7280"} />
          </TouchableOpacity>
        </AnimatedCard>

        {/* Period Selector */}
        <AnimatedCard
          delay={100}
          className={`${isDark ? "bg-gray-900" : "bg-white"} p-4 border-b ${isDark ? "border-gray-800" : "border-gray-200"}`}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {(["daily", "weekly", "monthly", "yearly"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg ${
                    period === p
                      ? "bg-green-600"
                      : isDark
                        ? "bg-gray-800"
                        : "bg-gray-200"
                  }`}
                >
                  <Text
                    className={`capitalize font-medium ${
                      period === p
                        ? "text-white"
                        : isDark
                          ? "text-gray-300"
                          : "text-gray-700"
                    }`}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Quick Date Range Buttons */}
          <View className="flex-row gap-2 mt-3 flex-wrap">
            {quickRanges.map((range) => {
              const disabled = isRangeDisabled(range.from, new Date());
              return (
                <TouchableOpacity
                  key={range.label}
                  onPress={() =>
                    !disabled &&
                    setDateRange({ from: range.from, to: new Date() })
                  }
                  disabled={disabled}
                  className={`px-3 py-2 rounded-lg ${
                    disabled
                      ? isDark
                        ? "bg-gray-800/50"
                        : "bg-gray-300"
                      : isDark
                        ? "bg-gray-800"
                        : "bg-gray-100"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      disabled
                        ? isDark
                          ? "text-gray-600"
                          : "text-gray-400"
                        : isDark
                          ? "text-gray-300"
                          : "text-gray-700"
                    }`}
                  >
                    {range.label}
                    {disabled && period === "daily"}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => !isCustomRangeDisabled() && setShowCalendar(true)}
              disabled={isCustomRangeDisabled()}
              className={`px-3 py-2 rounded-lg flex-row items-center gap-1 ${
                isCustomRangeDisabled()
                  ? isDark
                    ? "bg-gray-800/50"
                    : "bg-gray-300"
                  : isDark
                    ? "bg-green-900/30"
                    : "bg-green-100"
              }`}
            >
              <CalendarDays
                size={14}
                color={
                  isCustomRangeDisabled()
                    ? isDark
                      ? "#4b5563"
                      : "#9ca3af"
                    : "#22c55e"
                }
              />
              <Text
                className={`text-xs font-medium ${
                  isCustomRangeDisabled()
                    ? isDark
                      ? "text-gray-600"
                      : "text-gray-400"
                    : isDark
                      ? "text-green-400"
                      : "text-green-700"
                }`}
              >
                Custom Range
                {isCustomRangeDisabled()}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Current Date Range Display */}
          <View
            className={`mt-3 p-3 ${isDark ? "bg-gray-800" : "bg-gray-50"} rounded-lg`}
          >
            <Text
              className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"} font-medium`}
            >
              {format(dateRange.from, "MMM dd, yyyy")} -{" "}
              {format(dateRange.to, "MMM dd, yyyy")}
            </Text>
          </View>
        </AnimatedCard>

        {/* Summary Cards */}
        <View className="p-4">
          <View className="flex-row flex-wrap gap-3">
            {/* Total Calories Card */}
            <AnimatedCard
              delay={150}
              className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-4 flex-1 min-w-[45%] ${isDark ? "" : "shadow-sm"}`}
            >
              <View className="flex-row items-center gap-2 mb-2">
                <Target size={16} color="#22c55e" />
                <Text
                  className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"} font-medium`}
                >
                  Total Calories
                </Text>
              </View>
              <Text className="text-2xl font-bold text-green-600">
                {stats.totalCalories.toLocaleString()}
              </Text>
              <Text
                className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"} mt-1`}
              >
                Avg: {avgDailyCalories}/day
              </Text>
            </AnimatedCard>

            {/* Meals Logged Card */}
            <AnimatedCard
              delay={200}
              className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-4 flex-1 min-w-[45%] ${isDark ? "" : "shadow-sm"}`}
            >
              <View className="flex-row items-center gap-2 mb-2">
                <Activity size={16} color="#3b82f6" />
                <Text
                  className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"} font-medium`}
                >
                  Meals Logged
                </Text>
              </View>
              <Text className="text-2xl font-bold text-blue-600">
                {stats.totalMeals}
              </Text>
              <Text
                className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"} mt-1`}
              >
                Over {stats.daysLogged} days
              </Text>
            </AnimatedCard>

            {/* Protein Card */}
            <AnimatedCard
              delay={250}
              className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-4 flex-1 min-w-[45%] ${isDark ? "" : "shadow-sm"}`}
            >
              <View className="flex-row items-center gap-2 mb-2">
                <TrendingUp size={16} color="#a855f7" />
                <Text
                  className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"} font-medium`}
                >
                  Protein
                </Text>
              </View>
              <Text className="text-2xl font-bold text-purple-600">
                {Math.round(stats.totalProtein)}g
              </Text>
              <Text
                className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"} mt-1`}
              >
                Avg: {Math.round(stats.totalProtein / (stats.daysLogged || 1))}
                g/day
              </Text>
            </AnimatedCard>

            {/* Days Tracked Card */}
            <AnimatedCard
              delay={300}
              className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-4 flex-1 min-w-[45%] ${isDark ? "" : "shadow-sm"}`}
            >
              <View className="flex-row items-center gap-2 mb-2">
                <Clock size={16} color="#f97316" />
                <Text
                  className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"} font-medium`}
                >
                  Days Tracked
                </Text>
              </View>
              <Text className="text-2xl font-bold text-orange-600">
                {stats.daysLogged}
              </Text>
              <Text
                className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"} mt-1`}
              >
                Keep it up!
              </Text>
            </AnimatedCard>
          </View>
        </View>

        {/* Tab Selector */}
        <AnimatedCard
          delay={350}
          className={`${isDark ? "bg-gray-900" : "bg-white"} border-y ${isDark ? "border-gray-800" : "border-gray-200"} px-4`}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-4 py-3">
              {(["calories", "macros", "distribution", "meals"] as const).map(
                (tab) => (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg ${
                      activeTab === tab
                        ? isDark
                          ? "bg-green-900/30"
                          : "bg-green-100"
                        : "bg-transparent"
                    }`}
                  >
                    <Text
                      className={`capitalize font-medium ${
                        activeTab === tab
                          ? isDark
                            ? "text-green-400"
                            : "text-green-700"
                          : isDark
                            ? "text-gray-400"
                            : "text-gray-600"
                      }`}
                    >
                      {tab}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
          </ScrollView>
        </AnimatedCard>

        {/* Charts */}
        <View className="p-4 pb-8">
          {isLoading ? (
            <View
              className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-8 items-center`}
            >
              <ActivityIndicator size="large" color="#22c55e" />
              <Text
                className={`${isDark ? "text-gray-400" : "text-gray-600"} mt-4`}
              >
                Loading data...
              </Text>
            </View>
          ) : (
            <>
              {activeTab === "calories" && (
                <AnimatedCard
                  delay={400}
                  className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-4 ${isDark ? "" : "shadow-sm"}`}
                >
                  <Text
                    className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}
                  >
                    Daily Calorie Intake
                  </Text>
                  <Text
                    className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"} mb-4`}
                  >
                    Track your calorie consumption over time
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <LineChart
                      data={formatChartData()}
                      width={Math.max(
                        screenWidth - 48,
                        formatChartData().labels.length * 50,
                      )}
                      height={220}
                      chartConfig={chartConfig}
                      bezier
                      yAxisLabel=""
                      yAxisSuffix=""
                      style={{ marginVertical: 8, borderRadius: 16 }}
                    />
                  </ScrollView>
                </AnimatedCard>
              )}

              {activeTab === "macros" && (
                <AnimatedCard
                  delay={400}
                  className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-4 ${isDark ? "" : "shadow-sm"}`}
                >
                  <Text
                    className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}
                  >
                    Macronutrient Breakdown
                  </Text>
                  <Text
                    className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"} mb-4`}
                  >
                    Protein, carbs, and fat intake (stacked)
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <StackedBarChart
                      data={formatMacroChartData()}
                      width={Math.max(
                        screenWidth - 48,
                        formatMacroChartData().labels.length * 80,
                      )}
                      height={220}
                      chartConfig={{
                        ...chartConfig,
                        color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
                      }}
                      style={{ marginVertical: 8, borderRadius: 16 }}
                      hideLegend={true}
                      withVerticalLabels={true}
                      withHorizontalLabels={true}
                    />
                  </ScrollView>

                  {/* Legend */}
                  <View className="flex-row justify-center gap-4 mt-4">
                    <View className="flex-row items-center gap-2">
                      <View className="w-3 h-3 rounded-full bg-blue-600" />
                      <Text
                        className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                      >
                        Protein
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <View className="w-3 h-3 rounded-full bg-green-600" />
                      <Text
                        className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                      >
                        Carbs
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <View className="w-3 h-3 rounded-full bg-amber-600" />
                      <Text
                        className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                      >
                        Fat
                      </Text>
                    </View>
                  </View>
                </AnimatedCard>
              )}

              {activeTab === "distribution" && (
                <AnimatedCard
                  delay={400}
                  className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-4 ${isDark ? "" : "shadow-sm"}`}
                >
                  <Text
                    className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}
                  >
                    Macronutrient Distribution
                  </Text>
                  <Text
                    className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"} mb-4`}
                  >
                    Overall breakdown by calories
                  </Text>
                  <View className="items-center">
                    <PieChart
                      data={getPieChartData()}
                      width={screenWidth - 48}
                      height={220}
                      chartConfig={chartConfig}
                      accessor="population"
                      backgroundColor="transparent"
                      paddingLeft="15"
                      absolute
                    />
                  </View>
                </AnimatedCard>
              )}

              {activeTab === "meals" && (
                <AnimatedCard
                  delay={400}
                  className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-4 ${isDark ? "" : "shadow-sm"}`}
                >
                  {activeTab === "meals" && (
                    <AnimatedCard
                      delay={400}
                      className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl p-4 ${isDark ? "" : "shadow-sm"}`}
                    >
                      <View className="flex-row items-center gap-2 mb-6">
                        <Utensils size={20} color="#22c55e" />
                        <Text
                          className={`text-lg font-bold margin ${isDark ? "text-white" : "text-gray-900"}`}
                        >
                          All Meals ({meals.length})
                        </Text>
                      </View>

                      {meals.length > 0 ? (
                        <View className="gap-3">
                          {meals.map((meal, index) => (
                            <TouchableOpacity
                              onPress={() => openEditModal(meal)}
                              activeOpacity={0.7}
                              style={{ elevation: 4 }}
                            >
                              <AnimatedCard
                                key={meal.id}
                                delay={index * 30}
                                className={`flex-row rounded-2xl overflow-hidden ${isDark ? "bg-gray-800/50" : "bg-white"} ${isDark ? "" : "shadow-lg shadow-gray-200/50"}`}
                                style={{
                                  borderWidth: 1,
                                  borderColor: isDark ? "#1f2937" : "#f3f4f6",
                                }}
                              >
                                {/* Image Section */}
                                <View className="relative">
                                  {meal.image_url ? (
                                    <TouchableOpacity
                                      onPress={() =>
                                        setSelectedImage({
                                          url: meal.image_url!,
                                          name: meal.meal_name,
                                        })
                                      }
                                      activeOpacity={0.9}
                                      className="relative"
                                    >
                                      <Image
                                        source={{ uri: meal.image_url }}
                                        className="w-24 h-28"
                                      />
                                      <View className="absolute inset-0 items-center justify-center bg-black/30">
                                        <View className="bg-white/20 rounded-full p-2.5">
                                          <Eye
                                            size={18}
                                            color="white"
                                            strokeWidth={2.5}
                                          />
                                        </View>
                                      </View>
                                    </TouchableOpacity>
                                  ) : (
                                    <View
                                      className={`w-24 h-28 items-center justify-center ${isDark ? "bg-gray-700" : "bg-gray-100"}`}
                                    >
                                      <Utensils
                                        size={28}
                                        color={isDark ? "#4b5563" : "#d1d5db"}
                                        strokeWidth={1.5}
                                      />
                                    </View>
                                  )}
                                </View>

                                {/* Content Section */}
                                <View className="flex-1 px-4 py-3.5 justify-between">
                                  <View>
                                    <Text
                                      className={`text-base font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}
                                      numberOfLines={1}
                                    >
                                      {meal.meal_name}
                                    </Text>

                                    <View className="flex-row items-center gap-2 mb-2">
                                      <Text
                                        className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
                                      >
                                        {formatDateTimeLocal(
                                          meal.logged_at,
                                          "MMM dd, HH:mm",
                                        )}
                                      </Text>
                                      <View
                                        className={`w-0.5 h-3 rounded-full ${isDark ? "bg-gray-600" : "bg-gray-300"}`}
                                      />
                                      <View
                                        className={`px-2.5 py-1 rounded-full ${
                                          MEAL_TYPE_COLORS[
                                            meal.meal_type.toLowerCase() as keyof typeof MEAL_TYPE_COLORS
                                          ]?.[isDark ? "dark" : "light"] ||
                                          (isDark
                                            ? "bg-gray-700/50"
                                            : "bg-gray-100")
                                        }`}
                                      >
                                        <Text
                                          className={`text-xs font-medium ${
                                            MEAL_TYPE_TEXT_COLORS[
                                              meal.meal_type.toLowerCase() as keyof typeof MEAL_TYPE_TEXT_COLORS
                                            ]?.[isDark ? "dark" : "light"] ||
                                            (isDark
                                              ? "text-gray-300"
                                              : "text-gray-800")
                                          }`}
                                        >
                                          {meal.meal_type}
                                        </Text>
                                      </View>
                                    </View>

                                    <View className="flex-row gap-1.5">
                                      <View
                                        className={`flex-row items-center gap-1 px-2 py-1 rounded-full ${isDark ? "bg-gray-700/50" : "bg-gray-100"}`}
                                      >
                                        <Text
                                          className={`text-[10px] font-semibold ${isDark ? "text-gray-400" : "text-gray-500"}`}
                                        >
                                          P
                                        </Text>
                                        <Text
                                          className={`text-xs font-bold ${isDark ? "text-white" : "text-gray-900"}`}
                                        >
                                          {Math.round(meal.total_protein)}
                                        </Text>
                                      </View>
                                      <View
                                        className={`flex-row items-center gap-1 px-2 py-1 rounded-full ${isDark ? "bg-gray-700/50" : "bg-gray-100"}`}
                                      >
                                        <Text
                                          className={`text-[10px] font-semibold ${isDark ? "text-gray-400" : "text-gray-500"}`}
                                        >
                                          C
                                        </Text>
                                        <Text
                                          className={`text-xs font-bold ${isDark ? "text-white" : "text-gray-900"}`}
                                        >
                                          {Math.round(meal.total_carbs)}
                                        </Text>
                                      </View>
                                      <View
                                        className={`flex-row items-center gap-1 px-2 py-1 rounded-full ${isDark ? "bg-gray-700/50" : "bg-gray-100"}`}
                                      >
                                        <Text
                                          className={`text-[10px] font-semibold ${isDark ? "text-gray-400" : "text-gray-500"}`}
                                        >
                                          F
                                        </Text>
                                        <Text
                                          className={`text-xs font-bold ${isDark ? "text-white" : "text-gray-900"}`}
                                        >
                                          {Math.round(meal.total_fat)}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                </View>

                                {/* Calories & Edit Column */}
                                <View className="items-end justify-between py-3.5 pr-4">
                                  <View className="items-end">
                                    <Text className="text-2xl font-black text-green-500 tracking-tight">
                                      {Math.round(meal.total_calories)}
                                    </Text>
                                    <Text
                                      className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}
                                    >
                                      kcal
                                    </Text>
                                  </View>
                                </View>
                              </AnimatedCard>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <View className="items-center py-12">
                          <Utensils
                            size={48}
                            color={isDark ? "#4b5563" : "#d1d5db"}
                          />
                          <Text
                            className={`${isDark ? "text-gray-400" : "text-gray-500"} mt-4 text-lg font-medium`}
                          >
                            No meals found
                          </Text>
                          <Text
                            className={`text-sm ${isDark ? "text-gray-600" : "text-gray-400"} mt-1`}
                          >
                            Try adjusting your date range
                          </Text>
                        </View>
                      )}
                    </AnimatedCard>
                  )}
                </AnimatedCard>
              )}
            </>
          )}
        </View>
      </ScrollView>
      {renderEditMealModal()}
    </SafeAreaView>
  );
}

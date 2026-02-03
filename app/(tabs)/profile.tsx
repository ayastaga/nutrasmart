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
} from "react-native";
import { supabase } from "../../lib/supabase.web"; // Adjust path to your supabase client
import { useAuthContext } from "@/hooks/use-auth-context";
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
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar as RNCalendar } from "react-native-calendars";

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
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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

        mealsData?.forEach((meal) => {
          const mealDate = new Date(meal.logged_at);
          const localDateStr = mealDate.toLocaleDateString("en-CA", {
            timeZone: userTimezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });

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

  const fetchMeals = async () => {
    if (!session?.user) return;

    try {
      const startDate = format(startOfDay(dateRange.from), "yyyy-MM-dd");
      const endDate = format(startOfDay(dateRange.to), "yyyy-MM-dd");

      console.log("🍽️ Fetching meals:", { startDate, endDate });

      const { data, error } = await supabase
        .from("meals")
        .select("*, meal_dishes(*)")
        .eq("user_id", session.user.id)
        .gte("logged_at", `${startDate}T00:00:00.000Z`)
        .lte("logged_at", `${endDate}T23:59:59.999Z`)
        .order("logged_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("❌ Error fetching meals:", error);
        throw error;
      }

      console.log("✅ Fetched meals:", data?.length);
      setMeals(data || []);
    } catch (error) {
      console.error("Error fetching meals:", error);
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
          <Text
            className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"} mt-1`}
          >
            Timezone: {userTimezone}
          </Text>
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
                  <View className="flex-row items-center gap-2 mb-4">
                    <Utensils size={20} color="#22c55e" />
                    <Text
                      className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}
                    >
                      All Meals ({meals.length})
                    </Text>
                  </View>
                  {meals.length > 0 ? (
                    <View className="gap-3">
                      {meals.map((meal, index) => (
                        <AnimatedCard
                          key={meal.id}
                          delay={index * 30}
                          className={`flex-row items-center gap-3 p-3 ${isDark ? "bg-gray-800" : "bg-gray-50"} rounded-lg`}
                        >
                          {meal.image_url ? (
                            <TouchableOpacity
                              onPress={() =>
                                setSelectedImage({
                                  url: meal.image_url!,
                                  name: meal.meal_name,
                                })
                              }
                              className="relative"
                            >
                              <Image
                                source={{ uri: meal.image_url }}
                                className="w-16 h-16 rounded-lg"
                              />
                              <View className="absolute inset-0 items-center justify-center bg-black/20 rounded-lg">
                                <Eye size={16} color="white" />
                              </View>
                            </TouchableOpacity>
                          ) : (
                            <View
                              className={`w-16 h-16 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-200"} items-center justify-center`}
                            >
                              <Utensils
                                size={24}
                                color={isDark ? "#6b7280" : "#9ca3af"}
                              />
                            </View>
                          )}
                          <View className="flex-1">
                            <Text
                              className={`font-semibold text-base ${isDark ? "text-white" : "text-gray-900"}`}
                            >
                              {meal.meal_name}
                            </Text>
                            <Text
                              className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"} mt-1`}
                            >
                              {format(
                                new Date(meal.logged_at),
                                "MMM dd, HH:mm",
                              )}
                            </Text>
                            <View className="flex-row items-center gap-2 mt-1">
                              <View
                                className={`px-2 py-0.5 rounded ${
                                  MEAL_TYPE_COLORS[
                                    meal.meal_type.toLowerCase() as keyof typeof MEAL_TYPE_COLORS
                                  ]?.[isDark ? "dark" : "light"] ||
                                  (isDark ? "bg-gray-800/30" : "bg-gray-100")
                                }`}
                              >
                                <Text
                                  className={`text-xs ${
                                    MEAL_TYPE_TEXT_COLORS[
                                      meal.meal_type.toLowerCase() as keyof typeof MEAL_TYPE_TEXT_COLORS
                                    ]?.[isDark ? "dark" : "light"] ||
                                    (isDark ? "text-gray-300" : "text-gray-800")
                                  }`}
                                >
                                  {meal.meal_type}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View className="items-end">
                            <Text className="text-lg font-bold text-green-600">
                              {Math.round(meal.total_calories)}
                            </Text>
                            <Text
                              className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}
                            >
                              calories
                            </Text>
                            <View className="mt-2">
                              <Text
                                className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                              >
                                P: {Math.round(meal.total_protein)}g
                              </Text>
                              <Text
                                className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                              >
                                C: {Math.round(meal.total_carbs)}g
                              </Text>
                              <Text
                                className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                              >
                                F: {Math.round(meal.total_fat)}g
                              </Text>
                            </View>
                          </View>
                        </AnimatedCard>
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
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

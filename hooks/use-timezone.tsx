import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface TimezoneStore {
  timezone: string;
  isAutoDetect: boolean;
  setTimezone: (timezone: string) => void;
  setAutoDetect: (auto: boolean) => void;
  resetToAuto: () => void;
  getCurrentTimezone: () => string;
}

const getSystemTimezone = () => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

export const useTimezoneStore = create<TimezoneStore>()(
  persist(
    (set, get) => ({
      timezone: getSystemTimezone(),
      isAutoDetect: true,

      setTimezone: (timezone: string) => set({ timezone, isAutoDetect: false }),

      setAutoDetect: (auto: boolean) =>
        set({
          isAutoDetect: auto,
          timezone: auto ? getSystemTimezone() : get().timezone,
        }),

      resetToAuto: () =>
        set({
          timezone: getSystemTimezone(),
          isAutoDetect: true,
        }),

      getCurrentTimezone: () => {
        const state = get();
        return state.isAutoDetect ? getSystemTimezone() : state.timezone;
      },
    }),
    {
      name: "timezone-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

// Common timezones list
export const COMMON_TIMEZONES = [
  { label: "Auto-detect (Recommended)", value: "auto", region: "System" },
  {
    label: "Pacific Time (PT)",
    value: "America/Los_Angeles",
    region: "North America",
  },
  {
    label: "Mountain Time (MT)",
    value: "America/Denver",
    region: "North America",
  },
  {
    label: "Central Time (CT)",
    value: "America/Chicago",
    region: "North America",
  },
  {
    label: "Eastern Time (ET)",
    value: "America/New_York",
    region: "North America",
  },
  {
    label: "Atlantic Time (AT)",
    value: "America/Halifax",
    region: "North America",
  },
  { label: "London (GMT/BST)", value: "Europe/London", region: "Europe" },
  { label: "Paris (CET/CEST)", value: "Europe/Paris", region: "Europe" },
  { label: "Berlin (CET/CEST)", value: "Europe/Berlin", region: "Europe" },
  { label: "Dubai (GST)", value: "Asia/Dubai", region: "Middle East" },
  { label: "India (IST)", value: "Asia/Kolkata", region: "Asia" },
  { label: "Singapore (SGT)", value: "Asia/Singapore", region: "Asia" },
  { label: "Tokyo (JST)", value: "Asia/Tokyo", region: "Asia" },
  {
    label: "Sydney (AEST/AEDT)",
    value: "Australia/Sydney",
    region: "Australia",
  },
  {
    label: "Auckland (NZST/NZDT)",
    value: "Pacific/Auckland",
    region: "Pacific",
  },
  { label: "UTC", value: "UTC", region: "Universal" },
];

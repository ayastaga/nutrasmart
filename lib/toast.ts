// lib/toast.ts
import Toast from "react-native-toast-message";

export const toast = {
  success: (title: string, options?: { description?: string }) => {
    Toast.show({
      type: "success",
      text1: title,
      text2: options?.description,
    });
  },
  error: (title: string, options?: { description?: string }) => {
    Toast.show({
      type: "error",
      text1: title,
      text2: options?.description,
    });
  },
};

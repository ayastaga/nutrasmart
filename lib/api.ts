// lib/api.ts
import { supabase } from "./supabase.web";
import * as FileSystem from "expo-file-system/legacy";

export interface NutritionData {
  food_name: string;
  serving_qty: number;
  serving_unit: string;
  serving_weight_grams: number;
  nf_calories: number;
  nf_total_fat: number;
  nf_saturated_fat: number;
  nf_cholesterol: number;
  nf_sodium: number;
  nf_total_carbohydrate: number;
  nf_dietary_fiber: number;
  nf_sugars: number;
  nf_protein: number;
}

export interface Dish {
  name: string;
  servingSize: string;
  nutrition?: NutritionData;
  error?: string;
}

export interface ImageAnalysis {
  imageUrl: string;
  imageName: string;
  imageKey: string;
  description: string;
  confidence: number;
  objects?: string[];
  allergens?: string[];
  dishes?: Dish[];
  totalNutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodium: number;
  };
}

export interface AnalysisResult {
  images: ImageAnalysis[];
  overallTotalNutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodium: number;
  };
}

export interface UploadedFile {
  url: string;
  ufsUrl: string;
  key: string;
  name: string;
  size: number;
}

// Update in lib/api.ts
export interface MealData {
  mealName: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  imageUrl: string;
  imageKey?: string; // ADD THIS
  description: string;
  totalNutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodium: number;
  };
  dishes: Dish[];
}

export interface Meal {
  id: string;
  user_id: string;
  meal_name: string;
  meal_type: string;
  image_url: string;
  description: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number;
  total_sodium: number;
  logged_at: string;
  meal_dishes?: MealDish[];
}

export interface MealDish {
  id: string;
  meal_id: string;
  dish_name: string;
  serving_size: string;
  calories: number;
  protein: number;
  total_fat: number;
  total_carbohydrate: number;
  dietary_fiber: number;
  sodium: number;
}

/**
 * Upload an image to UploadThing via Supabase Edge Function
 */
export async function uploadImage(imageUri: string): Promise<UploadedFile> {
  try {
    const filename = imageUri.split("/").pop() || `photo-${Date.now()}.jpg`;

    console.log("Reading file:", filename);

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: "base64",
    });

    console.log("File read successfully, calling Edge Function...");

    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke("upload-image", {
      body: {
        imageBase64: `data:image/jpeg;base64,${base64}`,
        filename: filename,
      },
    });

    if (error) {
      console.error("Edge function error:", error);
      throw error;
    }

    if (!data) {
      throw new Error("No data returned from upload");
    }

    console.log("Upload successful:", data);

    return {
      url: data.url,
      ufsUrl: data.url,
      key: data.key,
      name: data.name,
      size: data.size,
    };
  } catch (error) {
    console.error("Error uploading image:", error);
    throw error;
  }
}

/**
 * Analyze uploaded images using Supabase Edge Function
 */
export async function analyzeImages(
  images: {
    url: string;
    key: string;
    name: string;
  }[],
): Promise<AnalysisResult> {
  try {
    console.log(
      "Calling analyze-images function with",
      images.length,
      "images",
    );

    const { data, error } = await supabase.functions.invoke("analyze-images", {
      body: { images },
    });

    if (error) {
      console.error("Edge function error:", error);
      throw error;
    }

    console.log("Analysis complete");
    return data;
  } catch (error) {
    console.error("Error analyzing images:", error);
    throw error;
  }
}

/**
 * Save a meal to the database
 */
export async function saveMeal(
  mealData: MealData,
): Promise<{ success: boolean; mealId: string }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("User not authenticated");
    }

    console.log("Saving meal to database...");

    const { data, error } = await supabase.functions.invoke("save-meal", {
      body: {
        mealName: mealData.mealName,
        mealType: mealData.mealType,
        imageUrl: mealData.imageUrl,
        imageKey: mealData.imageKey, // Add this field to MealData interface
        description: mealData.description,
        totalNutrition: mealData.totalNutrition,
        dishes: mealData.dishes,
      },
    });

    if (error) {
      console.error("Edge function error:", error);
      throw error;
    }

    console.log("Meal saved successfully:", data);

    return { success: true, mealId: data.mealId };
  } catch (error) {
    console.error("Error saving meal:", error);
    throw error;
  }
}

/**
 * Delete temporary images
 */
export async function deleteTempImages(imageKeys: string[]): Promise<void> {
  try {
    console.log("Deleting temp images:", imageKeys);

    const { data, error } = await supabase.functions.invoke(
      "delete-temp-images",
      {
        body: { imageKeys },
      },
    );

    if (error) {
      console.error("Error deleting temp images:", error);
      throw error;
    }

    console.log("Temp images deleted successfully");
  } catch (error) {
    console.error("Error deleting temp images:", error);
    // Don't throw - this is cleanup, not critical
  }
}

/**
 * Fetch meals from the database
 */
export async function getMeals(params: {
  startDate?: string;
  endDate?: string;
  mealType?: string;
  limit?: number;
}): Promise<{ meals: Meal[]; count: number }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("User not authenticated");
    }

    let query = supabase
      .from("meals")
      .select("*, meal_dishes(*)", { count: "exact" })
      .eq("user_id", user.id)
      .order("logged_at", { ascending: false });

    if (params.startDate) {
      query = query.gte("logged_at", params.startDate);
    }
    if (params.endDate) {
      query = query.lte("logged_at", params.endDate);
    }
    if (params.mealType) {
      query = query.eq("meal_type", params.mealType);
    }
    if (params.limit) {
      query = query.limit(params.limit);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return { meals: data || [], count: count || 0 };
  } catch (error) {
    console.error("Error fetching meals:", error);
    throw error;
  }
}

/**
 * Get nutrition summary for a period
 */
export async function getNutritionSummary(params: {
  period: "daily" | "weekly" | "monthly" | "yearly";
  startDate?: string;
  endDate?: string;
  limit?: number;
  timezone?: string;
}): Promise<any> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("User not authenticated");
    }

    let query = supabase.from("meals").select("*").eq("user_id", user.id);

    if (params.startDate) {
      query = query.gte("logged_at", params.startDate);
    }
    if (params.endDate) {
      query = query.lte("logged_at", params.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calculate summary based on period
    // This is a simplified version - you might want to do this in a Supabase function
    const summary = data?.reduce(
      (acc, meal) => {
        acc.totalCalories += meal.total_calories || 0;
        acc.totalProtein += meal.total_protein || 0;
        acc.totalCarbs += meal.total_carbs || 0;
        acc.totalFat += meal.total_fat || 0;
        acc.totalFiber += meal.total_fiber || 0;
        acc.totalSodium += meal.total_sodium || 0;
        return acc;
      },
      {
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        totalFiber: 0,
        totalSodium: 0,
      },
    );

    return {
      period: params.period,
      summary,
      meals: data,
    };
  } catch (error) {
    console.error("Error fetching nutrition summary:", error);
    throw error;
  }
}

export async function uploadAvatarApi(
  imageUri: string,
  userId: string,
): Promise<UploadedFile> {
  try {
    const filename = imageUri.split("/").pop() || `photo-${Date.now()}.jpg`;

    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: "base64",
    });

    // We pass <UploadedFile> here so TypeScript knows what 'data' is
    const { data, error } = await supabase.functions.invoke<UploadedFile>(
      "upload-avatar",
      {
        body: {
          imageBase64: `data:image/jpeg;base64,${base64}`,
          filename,
          userId,
        },
      },
    );

    if (error) throw error;
    if (!data) throw new Error("No data returned from upload");

    return {
      url: data.url,
      ufsUrl: data.url, // Mapping this since your interface requires it
      key: data.key,
      name: data.name || filename,
      size: data.size || 0,
    };
  } catch (err) {
    console.error("Error in uploadAvatar:", err);
    throw err;
  }
}

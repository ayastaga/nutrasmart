import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  Animated,
} from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  FlipHorizontal,
  Upload,
  X,
  Eye,
  ArrowLeft,
  Plus,
} from "lucide-react-native";
import {
  uploadImage,
  analyzeImages,
  saveMeal,
  deleteTempImages,
  type AnalysisResult,
  type UploadedFile,
  type MealData,
} from "@/lib/api";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

console.log(process.env.EXPO_PUBLIC_UPLOADTHING_TOKEN);

interface CapturedImage {
  uri: string;
  uploadedFile?: UploadedFile;
}

export default function HomeScreen() {
  const [facing, setFacing] = useState<CameraType>("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [showResults, setShowResults] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Scanning animation state
  const [showScanning, setShowScanning] = useState(false);
  const [currentScanningIndex, setCurrentScanningIndex] = useState(0);
  const scanLinePosition = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleSaveToProfile = async () => {
    if (!analysisResult || analysisResult.images.length === 0) return;

    setIsSaving(true);

    try {
      const imageAnalysis = analysisResult.images[0];

      const mealData: MealData = {
        mealName: imageAnalysis.description.substring(0, 50) || "Meal",
        mealType: "snack",
        imageUrl: imageAnalysis.imageUrl,
        imageKey: imageAnalysis.imageKey,
        description: imageAnalysis.description,
        totalNutrition: imageAnalysis.totalNutrition || {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
          sodium: 0,
        },
        dishes: imageAnalysis.dishes || [],
      };

      await saveMeal(mealData);

      Alert.alert("Success", "Meal saved to your profile!", [
        {
          text: "OK",
          onPress: () => {
            resetAnalysis();
          },
        },
      ]);
    } catch (error) {
      console.error("Error saving meal:", error);
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Failed to save meal. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Camera roll permission is required to upload images",
        );
      }
    })();
  }, []);

  // Scanning animation effect - keeps cycling through images while analyzing
  useEffect(() => {
    if (showScanning && capturedImages.length > 0) {
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Scan line animation (continuous loop)
      const scanAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLinePosition, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(scanLinePosition, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      );

      // Pulse animation for the corner brackets
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      );

      scanAnimation.start();
      pulseAnimation.start();

      // Cycle through images every 2 seconds while analysis is ongoing
      const timer = setTimeout(() => {
        if (isAnalyzing) {
          // Move to next image (loop back to start if at end)
          setCurrentScanningIndex((prev) =>
            prev < capturedImages.length - 1 ? prev + 1 : 0,
          );
          // Don't reset scanLinePosition - let it continue looping
        }
      }, 2000);

      return () => {
        clearTimeout(timer);
        scanAnimation.stop();
        pulseAnimation.stop();
      };
    }
  }, [showScanning, currentScanningIndex, isAnalyzing]);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Camera size={64} color="#10b981" />
          <Text style={styles.permissionText}>Camera permission required</Text>
          <Text style={styles.permissionSubtext}>
            Allow NutraSmart to use your camera to analyze food
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const toggleCameraFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const takePicture = async () => {
    if (capturedImages.length >= 5) {
      Alert.alert(
        "Limit Reached",
        "You can only analyze up to 5 images at a time",
      );
      return;
    }

    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
        });
        if (photo?.uri) {
          // Add to captured images and show preview
          setCapturedImages((prev) => [...prev, { uri: photo.uri }]);
          setShowPreview(true);
        }
      } catch (error) {
        console.error("Error taking picture:", error);
        Alert.alert("Error", "Failed to capture photo");
      }
    }
  };

  const pickImage = async () => {
    if (capturedImages.length >= 5) {
      Alert.alert(
        "Limit Reached",
        "You can only analyze up to 5 images at a time",
      );
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 5 - capturedImages.length,
      });

      if (!result.canceled) {
        const newImages = result.assets.map((asset) => ({ uri: asset.uri }));
        setCapturedImages((prev) => [...prev, ...newImages].slice(0, 5));
        setShowPreview(true);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const removeImage = (index: number) => {
    setCapturedImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setShowPreview(false);
      }
      return updated;
    });
  };

  const analyzeImagesHandler = async () => {
    if (capturedImages.length === 0) {
      Alert.alert("No Images", "Please capture or upload at least one image");
      return;
    }

    // Start scanning animation
    setShowScanning(true);
    setCurrentScanningIndex(0);
    setShowPreview(false);
    setIsAnalyzing(true);

    try {
      console.log("Starting upload and analysis...");

      const uploadPromises = capturedImages.map(async (img) => {
        try {
          if (img.uploadedFile) {
            return img.uploadedFile;
          }

          console.log("Uploading image:", img.uri);
          const uploadedFile = await uploadImage(img.uri);
          console.log("Upload success:", uploadedFile);

          setCapturedImages((prev) =>
            prev.map((i) => (i.uri === img.uri ? { ...i, uploadedFile } : i)),
          );

          return uploadedFile;
        } catch (error) {
          console.error("Upload failed for image:", img.uri, error);
          throw error;
        }
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      console.log("All images uploaded:", uploadedFiles.length);

      console.log("Starting AI analysis...");
      const result = await analyzeImages(
        uploadedFiles.map((file) => ({
          url: file.ufsUrl,
          key: file.key,
          name: file.name,
        })),
      );

      console.log("Analysis complete:", result);

      setAnalysisResult(result);

      // Results are ready - stop animation and show results
      setShowScanning(false);
      setShowResults(true);
    } catch (error) {
      console.error("Analysis error:", error);
      setShowScanning(false);
      Alert.alert(
        "Analysis Failed",
        error instanceof Error
          ? error.message
          : "Failed to analyze images. Please try again.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetAnalysis = async () => {
    if (analysisResult && analysisResult.images.length > 0) {
      const tempKeys = analysisResult.images
        .map((img) => img.imageKey)
        .filter((key) => key.startsWith("temp/"));

      if (tempKeys.length > 0) {
        await deleteTempImages(tempKeys);
      }
    }

    setShowResults(false);
    setShowPreview(false);
    setAnalysisResult(null);
    setCapturedImages([]);
    setExpandedImage(null);
  };

  const formatNutrient = (value: number, unit: string = "g") => {
    return `${Math.round(value * 10) / 10}${unit}`;
  };

  // Scanning Animation Overlay
  if (showScanning && capturedImages.length > 0) {
    const scanLineTranslateY = scanLinePosition.interpolate({
      inputRange: [0, 1],
      outputRange: [0, SCREEN_HEIGHT * 0.6],
    });

    const currentImage = capturedImages[currentScanningIndex];

    return (
      <View style={styles.container}>
        <Animated.View style={[styles.scanningOverlay, { opacity: fadeAnim }]}>
          <View style={styles.scanningContainer}>
            <Image
              source={{ uri: currentImage.uri }}
              style={styles.scanningImage}
            />

            {/* Corner brackets */}
            <Animated.View
              style={[
                styles.scanCornerTL,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <Animated.View
              style={[
                styles.scanCornerTR,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <Animated.View
              style={[
                styles.scanCornerBL,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <Animated.View
              style={[
                styles.scanCornerBR,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />

            {/* Scanning line */}
            <Animated.View
              style={[
                styles.scanLine,
                { transform: [{ translateY: scanLineTranslateY }] },
              ]}
            />

            {/* Grid overlay */}
            <View style={styles.gridOverlay}>
              {[...Array(8)].map((_, i) => (
                <View key={`h-${i}`} style={styles.gridLineHorizontal} />
              ))}
              {[...Array(6)].map((_, i) => (
                <View key={`v-${i}`} style={styles.gridLineVertical} />
              ))}
            </View>
          </View>

          <View style={styles.scanningTextContainer}>
            <ActivityIndicator size="small" color="#ffff" />
            <Text style={styles.scanningText}>
              Analyzing image {currentScanningIndex + 1} of{" "}
              {capturedImages.length}...
            </Text>
            <Text style={styles.scanningSubtext}>Detecting food items</Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  // Results View
  if (showResults && analysisResult) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.resultsContainer}>
          {/* Header */}
          <View style={styles.resultsHeader}>
            <TouchableOpacity onPress={resetAnalysis} style={styles.backButton}>
              <ArrowLeft size={24} color="#000" />
              <Text style={styles.backButtonText}>New Analysis</Text>
            </TouchableOpacity>
          </View>

          {/* Title */}
          <View style={styles.resultsTitle}>
            <Text style={styles.resultsTitleText}>
              Analysis Results ({analysisResult.images.length} Image
              {analysisResult.images.length > 1 ? "s" : ""})
            </Text>
          </View>

          {/* Overall Nutrition Summary */}
          {analysisResult.overallTotalNutrition && (
            <View style={styles.nutritionSummaryCard}>
              <Text style={styles.summaryTitle}>
                Combined Nutritional Information
              </Text>
              <Text style={styles.summarySubtitle}>
                Total nutrition from all {analysisResult.images.length} images
              </Text>
              <View style={styles.nutritionGrid}>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>
                    {Math.round(analysisResult.overallTotalNutrition.calories)}
                  </Text>
                  <Text style={styles.nutritionLabel}>Calories</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>
                    {formatNutrient(
                      analysisResult.overallTotalNutrition.protein,
                    )}
                  </Text>
                  <Text style={styles.nutritionLabel}>Protein</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>
                    {formatNutrient(analysisResult.overallTotalNutrition.carbs)}
                  </Text>
                  <Text style={styles.nutritionLabel}>Carbs</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>
                    {formatNutrient(analysisResult.overallTotalNutrition.fat)}
                  </Text>
                  <Text style={styles.nutritionLabel}>Fat</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>
                    {formatNutrient(analysisResult.overallTotalNutrition.fiber)}
                  </Text>
                  <Text style={styles.nutritionLabel}>Fiber</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>
                    {formatNutrient(
                      analysisResult.overallTotalNutrition.sodium,
                      "mg",
                    )}
                  </Text>
                  <Text style={styles.nutritionLabel}>Sodium</Text>
                </View>
              </View>
            </View>
          )}

          {/* Save to Profile Button */}
          <View>
            <TouchableOpacity
              onPress={handleSaveToProfile}
              disabled={isSaving}
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            >
              {isSaving ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.saveButtonText}>Saving...</Text>
                </>
              ) : (
                <>
                  <Plus size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Save to Profile</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Individual Images */}
          <Text style={styles.sectionTitle}>Individual Image Analysis</Text>
          {analysisResult.images.map((imageAnalysis, index) => (
            <View key={imageAnalysis.imageKey} style={styles.imageCard}>
              <TouchableOpacity
                onPress={() =>
                  setExpandedImage(
                    expandedImage === imageAnalysis.imageKey
                      ? null
                      : imageAnalysis.imageKey,
                  )
                }
              >
                <View style={styles.imageCardHeader}>
                  <View style={styles.imageCardHeaderContent}>
                    <Image
                      source={{ uri: imageAnalysis.imageUrl }}
                      style={styles.thumbnailImage}
                    />
                    <View style={styles.imageCardHeaderText}>
                      <Text style={styles.imageCardTitle}>
                        Image {index + 1}: {imageAnalysis.imageName}
                      </Text>
                      {imageAnalysis.totalNutrition && (
                        <Text style={styles.imageCardSubtitle}>
                          {Math.round(imageAnalysis.totalNutrition.calories)}{" "}
                          calories
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>

              {expandedImage === imageAnalysis.imageKey && (
                <View style={styles.imageCardContent}>
                  {/* Image Nutrition */}
                  {imageAnalysis.totalNutrition && (
                    <View style={styles.imageNutritionCard}>
                      <Text style={styles.cardSubtitle}>
                        Image Nutritional Summary
                      </Text>
                      <View style={styles.nutritionGrid}>
                        <View style={styles.smallNutritionItem}>
                          <Text style={styles.smallNutritionValue}>
                            {Math.round(imageAnalysis.totalNutrition.calories)}
                          </Text>
                          <Text style={styles.smallNutritionLabel}>
                            Calories
                          </Text>
                        </View>
                        <View style={styles.smallNutritionItem}>
                          <Text style={styles.smallNutritionValue}>
                            {formatNutrient(
                              imageAnalysis.totalNutrition.protein,
                            )}
                          </Text>
                          <Text style={styles.smallNutritionLabel}>
                            Protein
                          </Text>
                        </View>
                        <View style={styles.smallNutritionItem}>
                          <Text style={styles.smallNutritionValue}>
                            {formatNutrient(imageAnalysis.totalNutrition.carbs)}
                          </Text>
                          <Text style={styles.smallNutritionLabel}>Carbs</Text>
                        </View>
                        <View style={styles.smallNutritionItem}>
                          <Text style={styles.smallNutritionValue}>
                            {formatNutrient(imageAnalysis.totalNutrition.fat)}
                          </Text>
                          <Text style={styles.smallNutritionLabel}>Fat</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Description */}
                  <View style={styles.descriptionCard}>
                    <Text style={styles.cardSubtitle}>Description</Text>
                    <Text style={styles.descriptionText}>
                      {imageAnalysis.description}
                    </Text>
                    <Text style={styles.confidenceText}>
                      Confidence: {Math.round(imageAnalysis.confidence * 100)}%
                    </Text>
                  </View>

                  {/* Dishes */}
                  {imageAnalysis.dishes && imageAnalysis.dishes.length > 0 && (
                    <View style={styles.dishesSection}>
                      <Text style={styles.cardSubtitle}>
                        Dishes in This Image
                      </Text>
                      {imageAnalysis.dishes.map((dish, dishIndex) => (
                        <View key={dishIndex} style={styles.dishCard}>
                          <View style={styles.dishHeader}>
                            <Text style={styles.dishName}>{dish.name}</Text>
                            <Text style={styles.dishServing}>
                              {dish.servingSize}
                            </Text>
                          </View>
                          {dish.nutrition && (
                            <View style={styles.dishNutrition}>
                              <View style={styles.dishNutritionItem}>
                                <Text style={styles.dishNutritionValue}>
                                  {Math.round(dish.nutrition.nf_calories)}
                                </Text>
                                <Text style={styles.dishNutritionLabel}>
                                  Cal
                                </Text>
                              </View>
                              <View style={styles.dishNutritionItem}>
                                <Text style={styles.dishNutritionValue}>
                                  {formatNutrient(dish.nutrition.nf_protein)}
                                </Text>
                                <Text style={styles.dishNutritionLabel}>
                                  Protein
                                </Text>
                              </View>
                              <View style={styles.dishNutritionItem}>
                                <Text style={styles.dishNutritionValue}>
                                  {formatNutrient(
                                    dish.nutrition.nf_total_carbohydrate,
                                  )}
                                </Text>
                                <Text style={styles.dishNutritionLabel}>
                                  Carbs
                                </Text>
                              </View>
                              <View style={styles.dishNutritionItem}>
                                <Text style={styles.dishNutritionValue}>
                                  {formatNutrient(dish.nutrition.nf_total_fat)}
                                </Text>
                                <Text style={styles.dishNutritionLabel}>
                                  Fat
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}

          {/* Activity Suggestions */}
          {analysisResult.overallTotalNutrition && (
            <View style={styles.activityCard}>
              <Text style={styles.activityTitle}>Activity Suggestions</Text>
              <Text style={styles.activitySubtitle}>
                Time needed to burn{" "}
                {Math.round(analysisResult.overallTotalNutrition.calories)}{" "}
                calories
              </Text>
              <View style={styles.activityGrid}>
                <View style={styles.activityItem}>
                  <Text style={styles.activityValue}>
                    {Math.round(
                      analysisResult.overallTotalNutrition.calories / 10,
                    )}{" "}
                    min
                  </Text>
                  <Text style={styles.activityLabel}>Running</Text>
                </View>
                <View style={styles.activityItem}>
                  <Text style={styles.activityValue}>
                    {Math.round(
                      analysisResult.overallTotalNutrition.calories / 8,
                    )}{" "}
                    min
                  </Text>
                  <Text style={styles.activityLabel}>Cycling</Text>
                </View>
                <View style={styles.activityItem}>
                  <Text style={styles.activityValue}>
                    {Math.round(
                      analysisResult.overallTotalNutrition.calories / 6,
                    )}{" "}
                    min
                  </Text>
                  <Text style={styles.activityLabel}>Walking</Text>
                </View>
                <View style={styles.activityItem}>
                  <Text style={styles.activityValue}>
                    {Math.round(
                      analysisResult.overallTotalNutrition.calories / 12,
                    )}{" "}
                    min
                  </Text>
                  <Text style={styles.activityLabel}>Swimming</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Image Preview Screen (after capture, before analysis)
  if (showPreview && capturedImages.length > 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewScreenContainer}>
          {/* Header */}
          <View style={styles.previewHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowPreview(false);
                setCapturedImages([]);
              }}
              style={styles.previewBackButton}
            >
              <ArrowLeft size={24} color="#000" />
              <Text style={styles.previewBackText}>Back to Camera</Text>
            </TouchableOpacity>
            <Text style={styles.previewTitle}>
              {capturedImages.length} Image
              {capturedImages.length > 1 ? "s" : ""} Selected
            </Text>
          </View>

          {/* Image Grid */}
          <ScrollView
            style={styles.previewScrollView}
            contentContainerStyle={styles.previewGrid}
          >
            {capturedImages.map((img, index) => (
              <View key={index} style={styles.previewImageCard}>
                <Image
                  source={{ uri: img.uri }}
                  style={styles.previewImageLarge}
                />
                <TouchableOpacity
                  style={styles.previewRemoveButton}
                  onPress={() => removeImage(index)}
                >
                  <X size={20} color="#fff" />
                </TouchableOpacity>
                <View style={styles.previewImageNumber}>
                  <Text style={styles.previewImageNumberText}>{index + 1}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.previewActions}>
            {capturedImages.length < 5 && (
              <TouchableOpacity
                style={styles.previewAddButton}
                onPress={() => setShowPreview(false)}
              >
                <Plus size={20} color="#10b981" />
                <Text style={styles.previewAddButtonText}>Add More Photos</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.previewAnalyzeButton,
                isAnalyzing && styles.previewAnalyzeButtonDisabled,
              ]}
              onPress={analyzeImagesHandler}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.previewAnalyzeButtonText}>
                    Analyzing & Getting Nutrition...
                  </Text>
                </>
              ) : (
                <>
                  <Eye size={20} color="#fff" />
                  <Text style={styles.previewAnalyzeButtonText}>
                    Analyze {capturedImages.length} Image
                    {capturedImages.length > 1 ? "s" : ""}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Camera View
  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        <View style={styles.cameraOverlay}>
          {/* Top Controls */}
          <View style={styles.topControls}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={toggleCameraFacing}
            >
              <FlipHorizontal size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            {/* Gallery Button */}
            <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
              <Upload size={28} color="#fff" />
            </TouchableOpacity>

            {/* Capture Button */}
            <TouchableOpacity
              style={styles.captureButton}
              onPress={takePicture}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>

            {/* Counter */}
            <View style={styles.counterContainer}>
              <Text style={styles.counterText}>{capturedImages.length}/5</Text>
            </View>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  permissionText: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 20,
    color: "#000",
  },
  permissionSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 30,
  },
  permissionButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Scanning Animation Styles
  scanningOverlay: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  scanningContainer: {
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_HEIGHT * 0.6,
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  scanningImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  scanCornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#10b981",
  },
  scanCornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: "#10b981",
  },
  scanCornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#10b981",
  },
  scanCornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: "#10b981",
  },
  scanLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#10b981",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  gridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridLineHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  gridLineVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  scanningTextContainer: {
    marginTop: 32,
    alignItems: "center",
    gap: 8,
  },
  scanningText: {
    color: "#ffff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
  },
  scanningSubtext: {
    color: "#6b7280",
    fontSize: 14,
  },
  // Preview Screen Styles
  previewScreenContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  previewHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  previewBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  previewBackText: {
    fontSize: 16,
    color: "#000",
    fontWeight: "500",
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000",
  },
  previewScrollView: {
    flex: 1,
  },
  previewGrid: {
    padding: 16,
    gap: 16,
  },
  previewImageCard: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
    marginBottom: 16,
    position: "relative",
  },
  previewImageLarge: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  previewRemoveButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewImageNumber: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewImageNumberText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  previewActions: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 12,
  },
  previewAddButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#10b981",
    backgroundColor: "#fff",
  },
  previewAddButtonText: {
    color: "#10b981",
    fontSize: 16,
    fontWeight: "600",
  },
  previewAnalyzeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: "#10b981",
  },
  previewAnalyzeButtonDisabled: {
    opacity: 0.6,
  },
  previewAnalyzeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  topControls: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 20,
    paddingTop: 120,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  bottomControls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  galleryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
  },
  counterContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  counterText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Results styles
  resultsContainer: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  resultsHeader: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: "#000",
    fontWeight: "500",
  },
  resultsTitle: {
    padding: 16,
  },
  resultsTitleText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000",
  },
  nutritionSummaryCard: {
    margin: 16,
    padding: 16,
    backgroundColor: "#dbeafe",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#166534",
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: 14,
    color: "#059669",
    marginBottom: 16,
  },
  nutritionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  nutritionItem: {
    flex: 1,
    minWidth: "30%",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#166534",
  },
  nutritionLabel: {
    fontSize: 12,
    color: "#059669",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  imageCard: {
    margin: 16,
    marginTop: 0,
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageCardHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  imageCardHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  thumbnailImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  imageCardHeaderText: {
    flex: 1,
  },
  imageCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  imageCardSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  imageCardContent: {
    padding: 16,
    gap: 16,
  },
  imageNutritionCard: {
    padding: 12,
    backgroundColor: "#ede9fe",
    borderRadius: 8,
  },
  cardSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 12,
  },
  smallNutritionItem: {
    flex: 1,
    minWidth: "22%",
    alignItems: "center",
    padding: 8,
    backgroundColor: "#fff",
    borderRadius: 6,
  },
  smallNutritionValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e40af",
  },
  smallNutritionLabel: {
    fontSize: 10,
    color: "#3b82f6",
    marginTop: 2,
  },
  descriptionCard: {
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: "#4b5563",
    lineHeight: 20,
  },
  confidenceText: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
  },
  dishesSection: {
    gap: 12,
  },
  dishCard: {
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#10b981",
  },
  dishHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dishName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
    textTransform: "capitalize",
  },
  dishServing: {
    fontSize: 12,
    color: "#6b7280",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  dishNutrition: {
    flexDirection: "row",
    gap: 8,
  },
  dishNutritionItem: {
    flex: 1,
    alignItems: "center",
    padding: 8,
    backgroundColor: "#ecfdf5",
    borderRadius: 6,
  },
  dishNutritionValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#059669",
  },
  dishNutritionLabel: {
    fontSize: 10,
    color: "#10b981",
    marginTop: 2,
  },
  activityCard: {
    margin: 16,
    padding: 16,
    backgroundColor: "#fae8ff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9d5ff",
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#7c3aed",
    marginBottom: 4,
  },
  activitySubtitle: {
    fontSize: 14,
    color: "#a855f7",
    marginBottom: 16,
  },
  activityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  activityItem: {
    flex: 1,
    minWidth: "45%",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  activityValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#7c3aed",
  },
  activityLabel: {
    fontSize: 12,
    color: "#a855f7",
    marginTop: 4,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 115,
    paddingVertical: 10,
    backgroundColor: "#10b981",
    borderRadius: 8,
    flex: 1,
    margin: "auto",
    marginTop: 5,
    marginBottom: 15,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

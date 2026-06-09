import { BlurTargetView, BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { initializeQvac, runQvacPrompt, shutdownQvac } from "./src/lib/qvac";
import type { QvacState } from "./src/types";

const EMPTY_PROMPT = "";
const LOGO_IMAGE = require("./assets/icon.png");

type GlassPanelProps = {
  blurTarget: RefObject<View | null>;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
};

function GlassPanel({ blurTarget, children, contentStyle, intensity = 36, style }: GlassPanelProps) {
  const blurMethod = Platform.OS === "android" ? "dimezisBlurView" : undefined;

  return (
    <View style={[styles.glassShell, style]}>
      <BlurView
        blurTarget={blurTarget}
        blurMethod={blurMethod}
        blurReductionFactor={2}
        intensity={intensity}
        tint="dark"
        style={styles.glassBlur}
      >
        <View pointerEvents="none" style={styles.edgeLight} />
        <View pointerEvents="none" style={styles.specularSweep} />
        <View style={[styles.glassContent, contentStyle]}>{children}</View>
      </BlurView>
    </View>
  );
}

export default function App() {
  const [qvac, setQvac] = useState<QvacState>({
    modelId: null,
    status: "idle",
    message: "Not started",
    progress: null,
  });
  const [prompt, setPrompt] = useState(EMPTY_PROMPT);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const modelIdRef = useRef<string | null>(null);
  const blurTargetRef = useRef<View | null>(null);
  const questionInputRef = useRef<TextInput | null>(null);

  const loadingModel = qvac.status === "downloading" || qvac.status === "loading";
  const canRun = qvac.status === "ready" && prompt.trim().length > 0 && !running;
  const canEditPrompt = qvac.status === "ready" && !running;
  const showStartPanel = qvac.status !== "ready";
  const progressValue = qvac.status === "ready" ? 100 : Math.max(0, Math.min(100, qvac.progress ?? 0));
  const startPanelTitle = qvac.status === "error" ? "Try again" : loadingModel ? "Starting assistant" : "Start assistant";
  const startPanelMessage =
    qvac.status === "error"
      ? "Could not start. Check storage and connection, then try again."
      : loadingModel
        ? qvac.message
        : "Tap Start once before asking.";

  useEffect(() => {
    const blurTimer = setTimeout(() => {
      questionInputRef.current?.blur();
      Keyboard.dismiss();
    }, 250);

    return () => {
      clearTimeout(blurTimer);
      void shutdownQvac(modelIdRef.current);
    };
  }, []);

  useEffect(() => {
    const blurTimer = setTimeout(() => {
      questionInputRef.current?.blur();
      Keyboard.dismiss();
    }, 120);

    return () => clearTimeout(blurTimer);
  }, [qvac.status]);

  async function loadModel() {
    if (loadingModel || qvac.status === "ready") return;

    setRunError(null);
    try {
      const modelId = await initializeQvac((state) => {
        modelIdRef.current = state.modelId;
        setQvac(state);
      });
      modelIdRef.current = modelId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setQvac({
        modelId: null,
        status: "error",
        message,
        progress: null,
      });
    }
  }

  async function submitPrompt() {
    const trimmed = prompt.trim();
    if (!trimmed || running) return;
    if (!modelIdRef.current) {
      setRunError("Start first.");
      return;
    }

    setRunning(true);
    setOutput("");
    setRunError(null);

    try {
      const result = await runQvacPrompt(modelIdRef.current, trimmed, setOutput);
      setOutput(result.text);
    } catch (error) {
      setRunError("Could not answer. Try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <View style={styles.root}>
      <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
        <View style={styles.backdrop} />
        <View style={styles.topPlane} />
        <View style={styles.copperPlane} />
        <View style={styles.greenPlane} />
        <View style={styles.horizonLine} />
        <View style={styles.gridLineOne} />
        <View style={styles.gridLineTwo} />
      </BlurTargetView>

      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <Image
                  source={LOGO_IMAGE}
                  style={styles.logoMark}
                  resizeMode="cover"
                  accessibilityLabel="FieldMeridian logo"
                />
                <View style={styles.brandBlock}>
                  <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
                    FieldMeridian
                  </Text>
                  <Text style={styles.subtitle}>Ask in the field. Answers stay on this phone.</Text>
                </View>
              </View>
            </View>

            {showStartPanel ? (
              <GlassPanel blurTarget={blurTargetRef}>
                <View style={styles.modelHeader}>
                  <View style={styles.modelCopy}>
                    <Text style={styles.panelKicker}>START</Text>
                    <Text style={styles.modelName} numberOfLines={1} adjustsFontSizeToFit>
                      {startPanelTitle}
                    </Text>
                    <Text style={styles.modelMeta}>{startPanelMessage}</Text>
                  </View>
                </View>

                {loadingModel ? (
                  <>
                    <View style={styles.progressHeader}>
                      <Text style={styles.progressLabel}>{qvac.message}</Text>
                      <Text style={styles.progressValue}>{Math.round(progressValue)}%</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progressValue}%` }]} />
                    </View>
                  </>
                ) : null}

                <View style={styles.modelActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Start assistant"
                    style={({ pressed }) => [
                      styles.primaryButton,
                      loadingModel ? styles.disabledButton : null,
                      pressed ? styles.pressed : null,
                    ]}
                    onPress={loadModel}
                    disabled={loadingModel}
                  >
                    {loadingModel ? <ActivityIndicator size="small" color="#F7FBF5" /> : null}
                    <Text style={styles.primaryButtonText}>
                      {qvac.status === "error" ? "Try again" : loadingModel ? "Starting" : "Start"}
                    </Text>
                  </Pressable>
                </View>
              </GlassPanel>
            ) : null}

            <GlassPanel blurTarget={blurTargetRef} contentStyle={styles.promptContent}>
              <View style={styles.inputBlock}>
                <Text style={styles.panelKicker}>ASK</Text>
                <TextInput
                  ref={questionInputRef}
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder="Type your question"
                  placeholderTextColor="#7A8378"
                  style={[styles.promptInput, !canEditPrompt ? styles.disabledInput : null]}
                  multiline
                  textAlignVertical="top"
                  editable={canEditPrompt}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ask question"
                style={({ pressed }) => [
                  styles.runButton,
                  !canRun ? styles.disabledButton : null,
                  pressed ? styles.pressed : null,
                ]}
                onPress={submitPrompt}
                disabled={!canRun}
              >
                {running ? <ActivityIndicator size="small" color="#F7FBF5" /> : null}
                <Text style={styles.runButtonText}>{running ? "Working" : "Ask"}</Text>
              </Pressable>
              {runError ? <Text style={styles.errorInline}>{runError}</Text> : null}
            </GlassPanel>

            <GlassPanel blurTarget={blurTargetRef} contentStyle={styles.outputContent}>
              <View style={styles.outputHeader}>
                <Text style={styles.panelKicker}>ANSWER</Text>
              </View>
              <Text style={output ? styles.outputText : styles.emptyOutput}>
                {output || "Your answer will appear here."}
              </Text>
            </GlassPanel>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#111713",
  },
  safeArea: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "android" ? (NativeStatusBar.currentHeight ?? 0) + 20 : 18,
    paddingBottom: 28,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#111713",
  },
  topPlane: {
    position: "absolute",
    top: -60,
    left: -48,
    width: 520,
    height: 210,
    backgroundColor: "rgba(49, 120, 110, 0.38)",
    transform: [{ rotate: "-11deg" }],
  },
  copperPlane: {
    position: "absolute",
    top: 165,
    right: -130,
    width: 340,
    height: 160,
    backgroundColor: "rgba(181, 103, 59, 0.28)",
    transform: [{ rotate: "-18deg" }],
  },
  greenPlane: {
    position: "absolute",
    bottom: 80,
    left: -105,
    width: 360,
    height: 180,
    backgroundColor: "rgba(58, 126, 84, 0.22)",
    transform: [{ rotate: "15deg" }],
  },
  horizonLine: {
    position: "absolute",
    top: 252,
    left: 22,
    right: 22,
    height: 1,
    backgroundColor: "rgba(239, 246, 233, 0.18)",
  },
  gridLineOne: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 82,
    width: 1,
    backgroundColor: "rgba(239, 246, 233, 0.08)",
    transform: [{ rotate: "-7deg" }],
  },
  gridLineTwo: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 86,
    width: 1,
    backgroundColor: "rgba(239, 246, 233, 0.08)",
    transform: [{ rotate: "8deg" }],
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  brandRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 11,
    minWidth: 0,
  },
  logoMark: {
    backgroundColor: "rgba(235, 247, 255, 0.92)",
    borderColor: "rgba(246, 255, 244, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    height: 54,
    width: 54,
  },
  brandBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  title: {
    color: "#F7FBF5",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 36,
  },
  subtitle: {
    color: "#C8D2C4",
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
    maxWidth: 260,
  },
  glassShell: {
    backgroundColor: "rgba(239, 246, 233, 0.08)",
    borderColor: "rgba(246, 255, 244, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    elevation: 7,
    overflow: "hidden",
    shadowColor: "#07100C",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
  },
  glassBlur: {
    overflow: "hidden",
  },
  glassContent: {
    gap: 14,
    padding: 16,
  },
  edgeLight: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
  },
  specularSweep: {
    position: "absolute",
    top: -34,
    left: -70,
    width: 180,
    height: 90,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    transform: [{ rotate: "-24deg" }],
  },
  modelHeader: {
    flexDirection: "row",
  },
  modelCopy: {
    flex: 1,
    gap: 5,
  },
  panelKicker: {
    color: "#95BBA9",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  modelName: {
    color: "#F7FBF5",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 25,
  },
  modelMeta: {
    color: "#C3CEC0",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  progressLabel: {
    color: "#DDE7DA",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  progressValue: {
    color: "#F7FBF5",
    fontSize: 13,
    fontWeight: "900",
  },
  progressTrack: {
    backgroundColor: "rgba(247, 251, 245, 0.13)",
    borderRadius: 4,
    height: 8,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: "#7FCF9A",
    borderRadius: 4,
    height: "100%",
  },
  modelActions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2E7E57",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: "#F7FBF5",
    fontSize: 16,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.48,
  },
  disabledInput: {
    opacity: 0.62,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 1 }],
  },
  promptContent: {
    gap: 14,
  },
  inputBlock: {
    gap: 9,
  },
  promptInput: {
    backgroundColor: "rgba(8, 15, 12, 0.54)",
    borderColor: "rgba(247, 251, 245, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#F7FBF5",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    minHeight: 118,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 13,
  },
  runButton: {
    alignItems: "center",
    backgroundColor: "#B86C45",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
  },
  runButtonText: {
    color: "#FFF8F2",
    fontSize: 17,
    fontWeight: "900",
  },
  errorInline: {
    color: "#FFD0C6",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  outputContent: {
    minHeight: 152,
  },
  outputHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  outputText: {
    color: "#F7FBF5",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 23,
  },
  emptyOutput: {
    color: "#9DA99A",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
  },
});

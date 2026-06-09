import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "./src/components/Icon";
import { OfflineMap } from "./src/components/OfflineMap";
import { runLocalQuery } from "./src/lib/spatial";
import { initializeQvac, runQvacQuery, shutdownQvac } from "./src/lib/qvac";
import type { QvacState, SpatialResult } from "./src/types";

const SAMPLE_QUERIES = [
  "Find nearest hospital to Camp 6",
  "List pharmacies within 2km of Condado",
  "Find nearest shelter to Camp 3",
  "Where is Puerta de Tierra?",
];

const initialQuery = SAMPLE_QUERIES[0];

export default function App() {
  const [qvac, setQvac] = useState<QvacState>({
    modelId: null,
    status: "idle",
    message: "Starting local runtime",
    progress: null,
  });
  const [input, setInput] = useState(initialQuery);
  const [result, setResult] = useState<SpatialResult>(() => runLocalQuery(initialQuery));
  const [busy, setBusy] = useState(false);
  const modelIdRef = useRef<string | null>(null);

  const statusTone = useMemo(() => {
    if (qvac.status === "ready") return styles.statusReady;
    if (qvac.status === "error") return styles.statusError;
    return styles.statusWorking;
  }, [qvac.status]);

  useEffect(() => {
    let alive = true;
    void initializeQvac((state) => {
      if (!alive) return;
      modelIdRef.current = state.modelId;
      setQvac(state);
    }).then((modelId) => {
      modelIdRef.current = modelId;
    });

    return () => {
      alive = false;
      void shutdownQvac(modelIdRef.current);
    };
  }, []);

  async function submitQuery(nextQuery = input) {
    const trimmed = nextQuery.trim();
    if (!trimmed || busy) return;

    setInput(trimmed);
    setBusy(true);
    try {
      setResult(await runQvacQuery(modelIdRef.current, trimmed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.brandBlock}>
              <Text style={styles.eyebrow}>QVAC EDGE AI</Text>
              <Text style={styles.title}>FieldMeridian</Text>
              <Text style={styles.subtitle}>Offline spatial queries for field teams.</Text>
            </View>
            <View style={[styles.statusPill, statusTone]}>
              {qvac.status === "ready" ? <Icon name="shield-check" size={15} color="#FFFFFF" /> : null}
              {qvac.status !== "ready" && qvac.status !== "error" ? (
                <ActivityIndicator size="small" color="#2C2B27" />
              ) : null}
              <Text style={[styles.statusText, qvac.status === "ready" ? styles.statusTextReady : null]}>
                {qvac.status === "ready" ? "QVAC ready" : qvac.status === "error" ? "Local fallback" : "Loading"}
              </Text>
            </View>
          </View>

          <View style={styles.proofRow}>
            <View style={styles.proofItem}>
              <Icon name="wifi-off" size={17} color="#2E5E47" />
              <Text style={styles.proofText}>Zero cloud query path</Text>
            </View>
            <View style={styles.proofItem}>
              <Icon name="cpu" size={17} color="#8C4F18" />
              <Text style={styles.proofText}>{qvac.message}</Text>
            </View>
          </View>

          <OfflineMap result={result} />

          <View style={styles.queryPanel}>
            <View style={styles.inputWrap}>
              <Icon name="search" size={19} color="#5A554D" />
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => submitQuery()}
                returnKeyType="search"
                placeholder="Ask a local spatial question"
                placeholderTextColor="#7B7468"
                style={styles.input}
                editable={!busy}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Run spatial query"
              style={({ pressed }) => [styles.runButton, pressed ? styles.pressed : null]}
              onPress={() => submitQuery()}
              disabled={busy}
            >
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="route" size={18} color="#FFFFFF" />}
              <Text style={styles.runButtonText}>{busy ? "Running" : "Run"}</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.samples}
          >
            {SAMPLE_QUERIES.map((query) => (
              <Pressable
                accessibilityRole="button"
                key={query}
                style={({ pressed }) => [styles.sampleButton, pressed ? styles.pressed : null]}
                onPress={() => submitQuery(query)}
              >
                <Text style={styles.sampleButtonText}>{query}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.resultPanel}>
            <View style={styles.resultHeader}>
              <View style={styles.resultIcon}>
                <Icon name="map-pin" size={18} color="#FFFFFF" />
              </View>
              <View style={styles.resultTitleBlock}>
                <Text style={styles.resultTitle}>{result.title}</Text>
                <Text style={styles.resultSubtitle}>{result.summary}</Text>
              </View>
            </View>

            {result.route ? (
              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>{result.route.durationMinutes} min</Text>
                  <Text style={styles.metricLabel}>walking</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>{Math.round(result.route.distanceMeters)} m</Text>
                  <Text style={styles.metricLabel}>route</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>{result.markers.length}</Text>
                  <Text style={styles.metricLabel}>markers</Text>
                </View>
              </View>
            ) : null}

            {result.route ? (
              <View style={styles.steps}>
                {result.route.steps.map((step, index) => (
                  <View key={`${step.instruction}-${index}`} style={styles.step}>
                    <View style={styles.stepIndex}>
                      <Text style={styles.stepIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stepTextBlock}>
                      <Text style={styles.stepInstruction}>{step.instruction}</Text>
                      <Text style={styles.stepDistance}>{Math.round(step.distanceMeters)} m</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.evidencePanel}>
            <View style={styles.evidenceHeader}>
              <Icon name="locate-fixed" size={17} color="#2C2B27" />
              <Text style={styles.evidenceTitle}>Evidence</Text>
            </View>
            <Text style={styles.evidenceLine}>Tool: {result.toolName}</Text>
            <Text style={styles.evidenceLine}>Mode: {result.mode === "qvac" ? "QVAC local inference" : "Local deterministic fallback"}</Text>
            <Text style={styles.evidenceLine}>Bundle: {result.evidence.cityBundle}</Text>
            <Text style={styles.evidenceLine}>Latency: {result.evidence.latencyMs} ms</Text>
            {result.evidence.backendDevice ? (
              <Text style={styles.evidenceLine}>Backend: {result.evidence.backendDevice}</Text>
            ) : null}
            {result.evidence.tokensPerSecond ? (
              <Text style={styles.evidenceLine}>
                Decode: {result.evidence.tokensPerSecond.toFixed(1)} tok/s
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#EFEAE1",
  },
  keyboard: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 26,
    gap: 14,
  },
  header: {
    paddingTop: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  brandBlock: {
    flex: 1,
  },
  eyebrow: {
    color: "#8C4F18",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
  },
  title: {
    color: "#171714",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 38,
  },
  subtitle: {
    color: "#514C44",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  statusPill: {
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
  },
  statusReady: {
    backgroundColor: "#2E5E47",
    borderColor: "#2E5E47",
  },
  statusWorking: {
    backgroundColor: "#F6F1E8",
    borderColor: "#CFC4B2",
  },
  statusError: {
    backgroundColor: "#F8E7E0",
    borderColor: "#C85F4E",
  },
  statusText: {
    color: "#2C2B27",
    fontSize: 12,
    fontWeight: "800",
  },
  statusTextReady: {
    color: "#FFFFFF",
  },
  proofRow: {
    flexDirection: "row",
    gap: 10,
  },
  proofItem: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D2C6B3",
    backgroundColor: "#F9F5EE",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  proofText: {
    flex: 1,
    color: "#3A362F",
    fontSize: 12,
    fontWeight: "700",
  },
  queryPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputWrap: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2C2B27",
    backgroundColor: "#FFFDF8",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#1C1B18",
    fontSize: 15,
    fontWeight: "600",
  },
  runButton: {
    height: 50,
    minWidth: 86,
    borderRadius: 8,
    backgroundColor: "#B44738",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 13,
  },
  runButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.72,
  },
  samples: {
    gap: 8,
    paddingRight: 18,
  },
  sampleButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B9AD9C",
    backgroundColor: "#FBF7F0",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sampleButtonText: {
    color: "#2F2D28",
    fontSize: 12,
    fontWeight: "800",
  },
  resultPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#292824",
    backgroundColor: "#FFFDF8",
    padding: 14,
    gap: 13,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#2E5E47",
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitleBlock: {
    flex: 1,
    gap: 4,
  },
  resultTitle: {
    color: "#1C1B18",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 23,
  },
  resultSubtitle: {
    color: "#4D4840",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 9,
  },
  metric: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "#F1E9DB",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  metricValue: {
    color: "#1F1D19",
    fontSize: 17,
    fontWeight: "900",
  },
  metricLabel: {
    color: "#6A6257",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  steps: {
    gap: 9,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2C2B27",
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndexText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  stepTextBlock: {
    flex: 1,
    minWidth: 0,
    borderBottomColor: "#E1D7C8",
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  stepInstruction: {
    color: "#2A2823",
    fontSize: 14,
    fontWeight: "800",
  },
  stepDistance: {
    color: "#746C5F",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  evidencePanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9BCA8",
    backgroundColor: "#F8F2E9",
    padding: 13,
    gap: 5,
  },
  evidenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 3,
  },
  evidenceTitle: {
    color: "#2C2B27",
    fontSize: 14,
    fontWeight: "900",
  },
  evidenceLine: {
    color: "#4D473D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
});

import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { NunitoSans_400Regular } from "@expo-google-fonts/nunito-sans/400Regular";
import { NunitoSans_500Medium } from "@expo-google-fonts/nunito-sans/500Medium";
import { NunitoSans_600SemiBold } from "@expo-google-fonts/nunito-sans/600SemiBold";
import { NunitoSans_700Bold } from "@expo-google-fonts/nunito-sans/700Bold";
import { NunitoSans_800ExtraBold } from "@expo-google-fonts/nunito-sans/800ExtraBold";
import { NunitoSans_900Black } from "@expo-google-fonts/nunito-sans/900Black";
import { useFonts } from "@expo-google-fonts/nunito-sans/useFonts";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text as NativeText,
  TextInput as NativeTextInput,
  View,
  StatusBar as NativeStatusBar,
  useWindowDimensions,
  type GestureResponderEvent,
  type TextStyle,
} from "react-native";

import type { Basket, SearchMode, StashData, StashItem, StashItemType } from "../domain/stash";
import { consumeSharedText } from "../native/shareIntent";
import { fetchLinkMetadata, isSafeRemoteUrl } from "../services/linkMetadata/linkMetadata";
import { initializeQvac, shutdownQvac } from "../services/qvac/qvacRuntime";
import type { QvacState } from "../services/qvac/qvacTypes";
import { cleanModelLine } from "../services/qvac/modelText";
import { suggestForItem } from "../services/qvac/stashAssistant";
import {
  addBasket,
  createDraftFromInput,
  createDraftFromShare,
  createItemFromDraft,
  createSeedData,
  exportStashBackup,
  exportStashData,
  exportStashMarkdown,
  formatItemForCopy,
  getInboxId,
  hideItem,
  importStashBackupFromDirectory,
  loadStashData,
  persistStashData,
  searchItems,
  updateSettings,
  upsertItem,
} from "../storage/stashStore";
import { colors } from "./theme";

const LOGO_IMAGE = require("../../assets/icon.png");
const ONBOARDING_BACKGROUND = require("../../assets/onboarding-background.jpg");
const PREVIEW_CACHE_DIR = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}stash-previews/`;

const FONT_FAMILIES = {
  regular: "NunitoSans_400Regular",
  medium: "NunitoSans_500Medium",
  semiBold: "NunitoSans_600SemiBold",
  bold: "NunitoSans_700Bold",
  extraBold: "NunitoSans_800ExtraBold",
  black: "NunitoSans_900Black",
} as const;

function fontFamilyForStyle(style: ComponentProps<typeof NativeText>["style"]) {
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const weight = String(flattened?.fontWeight ?? "400");

  if (weight === "900" || weight === "black") return FONT_FAMILIES.black;
  if (weight === "800" || weight === "heavy") return FONT_FAMILIES.extraBold;
  if (weight === "700" || weight === "bold") return FONT_FAMILIES.bold;
  if (weight === "600" || weight === "semibold") return FONT_FAMILIES.semiBold;
  if (weight === "500" || weight === "medium") return FONT_FAMILIES.medium;
  return FONT_FAMILIES.regular;
}

function Text({ style, ...props }: ComponentProps<typeof NativeText>) {
  return <NativeText {...props} style={[{ fontFamily: fontFamilyForStyle(style) }, style]} />;
}

function TextInput({ style, ...props }: ComponentProps<typeof NativeTextInput>) {
  return <NativeTextInput {...props} style={[{ fontFamily: fontFamilyForStyle(style) }, style]} />;
}

type SaveForm = {
  basketId: string;
  input: string;
  isPrivate: boolean;
  tags: string;
  title: string;
};

type IconName =
  | "backup"
  | "basket"
  | "close"
  | "copy"
  | "delete"
  | "import"
  | "json"
  | "library"
  | "link"
  | "map"
  | "markdown"
  | "open"
  | "plus"
  | "preview"
  | "privacy"
  | "save"
  | "search"
  | "settings"
  | "share"
  | "sort";

const EMPTY_FORM: SaveForm = {
  basketId: "",
  input: "",
  isPrivate: false,
  tags: "",
  title: "",
};

export function AppRoot() {
  const { height, width } = useWindowDimensions();
  const [fontsLoaded, fontError] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_500Medium,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
    NunitoSans_900Black,
    ...MaterialIcons.font,
  });
  const androidTopInset = Platform.OS === "android" ? Math.max(NativeStatusBar.currentHeight ?? 0, 38) : 0;
  const [data, setData] = useState<StashData | null>(null);
  const [mode, setMode] = useState<SearchMode>("library");
  const [query, setQuery] = useState("");
  const [selectedBasketId, setSelectedBasketId] = useState<string | undefined>();
  const [selectedSearchType, setSelectedSearchType] = useState<StashItemType | "all">("all");
  const [form, setForm] = useState<SaveForm>(EMPTY_FORM);
  const [saveOpen, setSaveOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newBasketName, setNewBasketName] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [assistantBusyId, setAssistantBusyId] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState<"json" | "markdown" | "import" | null>(null);
  const [metadataBusyId, setMetadataBusyId] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [qvac, setQvac] = useState<QvacState>({
    modelId: null,
    status: "idle",
    message: "Off",
    progress: null,
  });

  const appState = useRef(AppState.currentState);
  const assistantQueueRef = useRef<string[]>([]);
  const autoStartedAssistantRef = useRef(false);
  const dataRef = useRef<StashData | null>(null);
  const metadataAutoFetchedRef = useRef(new Set<string>());
  const modelIdRef = useRef<string | null>(null);
  const processingAssistantQueueRef = useRef(false);
  const contentWidth = Math.min(width - 32, 740);

  useEffect(() => {
    let mounted = true;

    if (Platform.OS === "android") {
      NativeStatusBar.setBackgroundColor(colors.background);
      NativeStatusBar.setTranslucent(false);
    }

    void loadStashData().then((loaded) => {
      if (!mounted) return;
      const inboxId = getInboxId(loaded) ?? loaded.baskets[0]?.id ?? "";
      setData(loaded);
      setForm((current) => ({ ...current, basketId: current.basketId || inboxId }));
    });

    return () => {
      mounted = false;
      void shutdownQvac(modelIdRef.current);
    };
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const ingestSharedText = useCallback(async () => {
    const current = data;
    if (!current) return;

    const payload = await consumeSharedText();
    if (!payload.hasShare) return;

    const inboxId = getInboxId(current) ?? current.baskets[0]?.id;
    if (!inboxId) return;

    const draft = createDraftFromShare(payload, inboxId);
    if (!draft) return;

    await saveDraft(draft, "Saved from share sheet");
    setMode("library");
  }, [data]);

  useEffect(() => {
    void ingestSharedText();
  }, [ingestSharedText]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        void ingestSharedText();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [ingestSharedText]);

  useEffect(() => {
    if (!data || !data.settings.onboardingComplete || autoStartedAssistantRef.current) return;

    autoStartedAssistantRef.current = true;
    void startAssistant();
  }, [data]);

  useEffect(() => {
    if (qvac.status === "ready") {
      void processAssistantQueue();
    }
  }, [qvac.status, data]);

  useEffect(() => {
    if (!data?.settings.fetchLinkPreviews || metadataBusyId) return;

    const nextItem = data.items.find(
      (item) =>
        item.url &&
        !item.deletedAt &&
        !item.archived &&
        !item.isPrivate &&
        (item.metadata?.status !== "fetched" || Boolean(item.metadata?.imageUrl && !item.metadata.cachedImageUri)) &&
        item.metadata?.status !== "pending" &&
        !metadataAutoFetchedRef.current.has(item.id),
    );
    if (!nextItem) return;

    metadataAutoFetchedRef.current.add(nextItem.id);
    void enrichMetadata(nextItem);
  }, [data, metadataBusyId]);

  useEffect(() => {
    if (!notice) return undefined;

    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const baskets = useMemo(() => data?.baskets.filter((basket) => !basket.archived) ?? [], [data]);
  const basketById = useMemo(() => new Map(baskets.map((basket) => [basket.id, basket])), [baskets]);
  const visibleItems = useMemo(() => {
    if (!data) return [];
    const found = searchItems(data, mode === "search" ? query : "", selectedBasketId);
    return mode === "search" && selectedSearchType !== "all"
      ? found.filter((item) => item.type === selectedSearchType)
      : found;
  }, [data, mode, query, selectedBasketId, selectedSearchType]);
  const selectedItem = useMemo(
    () => data?.items.find((item) => item.id === selectedItemId && !item.deletedAt) ?? null,
    [data, selectedItemId],
  );
  async function updateData(next: StashData) {
    setData(next);
    await persistStashData(next);
  }

  async function saveDraft(draft: Parameters<typeof createItemFromDraft>[0], message = "Saved") {
    if (!data) return;

    const item = createItemFromDraft(draft);
    const shouldFetchMetadata = Boolean(item.url && data.settings.fetchLinkPreviews && !item.isPrivate);
    const preparedItem: StashItem = shouldFetchMetadata
      ? { ...item, metadata: { status: "pending" } }
      : item.url
        ? { ...item, metadata: { status: item.isPrivate ? "disabled" : data.settings.fetchLinkPreviews ? "idle" : "disabled" } }
        : item;

    const next = upsertItem(data, preparedItem);
    await updateData(next);
    setNotice(message);
    setSelectedItemId(preparedItem.id);
    queueAssistant(preparedItem.id);

    if (shouldFetchMetadata && preparedItem.url) {
      void enrichMetadata(preparedItem);
    }
  }

  async function saveManualItem() {
    if (!data || busy) return;

    const input = form.input.trim();
    if (!input) {
      setNotice("Add text or a link first");
      return;
    }

    setBusy(true);
    const draft = createDraftFromInput(input, {
      basketId: form.basketId || getInboxId(data) || data.baskets[0]?.id,
      isPrivate: form.isPrivate,
      title: form.title,
      userTags: form.tags.split(","),
    });

    await saveDraft(draft);
    setForm((current) => ({
      ...EMPTY_FORM,
      basketId: current.basketId,
    }));
    setBusy(false);
    return true;
  }

  async function enrichMetadata(item: StashItem) {
    if (!item.url || !data) return;

    setMetadataBusyId(item.id);
    const fetchedMetadata = await fetchLinkMetadata(item.url);
    const cachedImageUri = await cachePreviewImage(item.id, fetchedMetadata.imageUrl);
    const metadata = cachedImageUri ? { ...fetchedMetadata, cachedImageUri } : fetchedMetadata;
    setData((current) => {
      if (!current) return current;
      const found = current.items.find((candidate) => candidate.id === item.id);
      if (!found) return current;

      const titleLooksGeneric = found.title === found.domain || found.title === "Saved link";
      const enriched: StashItem = {
        ...found,
        metadata,
        title: metadata.title && titleLooksGeneric ? metadata.title : found.title,
        updatedAt: new Date().toISOString(),
      };
      const next = upsertItem(current, enriched);
      void persistStashData(next);
      return next;
    });
    setMetadataBusyId(null);
  }

  async function startAssistant() {
    if (qvac.status === "ready" || qvac.status === "downloading" || qvac.status === "loading") return;

    const modelId = await initializeQvac((state) => {
      modelIdRef.current = state.modelId;
      setQvac(state);
    });
    modelIdRef.current = modelId;
  }

  async function runAssistant(item: StashItem) {
    queueAssistant(item.id);
    if (qvac.status !== "ready") await startAssistant();
    await processAssistantQueue();
  }

  function queueAssistant(itemId: string) {
    if (!assistantQueueRef.current.includes(itemId)) {
      assistantQueueRef.current.push(itemId);
    }
    void processAssistantQueue();
  }

  async function processAssistantQueue() {
    if (processingAssistantQueueRef.current || qvac.status !== "ready" || !modelIdRef.current) return;

    processingAssistantQueueRef.current = true;

    try {
      while (assistantQueueRef.current.length > 0) {
        const itemId = assistantQueueRef.current.shift();
        const current = dataRef.current;
        const item = current?.items.find((candidate) => candidate.id === itemId && !candidate.deletedAt);
        if (!current || !item) continue;

        setAssistantBusyId(item.id);
        try {
          const suggestion = await suggestForItem(modelIdRef.current, item, current.baskets);
          const latest = dataRef.current;
          const latestItem = latest?.items.find((candidate) => candidate.id === item.id && !candidate.deletedAt);
          if (!latest || !latestItem) continue;

          const enriched: StashItem = {
            ...latestItem,
            aiTags: suggestion.aiTags.length ? suggestion.aiTags : latestItem.aiTags,
            basketId: suggestion.basketId ?? latestItem.basketId,
            summary: suggestion.summary ?? latestItem.summary,
            title: suggestion.title && isPlainTitle(latestItem.title) ? suggestion.title : latestItem.title,
          };
          const next = upsertItem(latest, enriched);
          dataRef.current = next;
          setData(next);
          await persistStashData(next);
        } catch {
          setNotice("On-device sorting could not finish");
        }
      }
    } finally {
      setAssistantBusyId(null);
      processingAssistantQueueRef.current = false;
    }
  }

  async function copyItem(item: StashItem) {
    await Clipboard.setStringAsync(formatItemForCopy(item, basketById.get(item.basketId)));
    setNotice("Copied");
  }

  async function copyItemLink(item: StashItem) {
    if (!item.url) {
      await copyItem(item);
      return;
    }

    await Clipboard.setStringAsync(item.url);
    setNotice("Link copied");
  }

  async function shareItem(item: StashItem) {
    await Share.share({
      message: formatItemForCopy(item, basketById.get(item.basketId)),
      title: item.title,
    });
  }

  async function openItemLink(item: StashItem) {
    if (!item.url) return;

    const supported = await Linking.canOpenURL(item.url);
    if (!supported) {
      setNotice("Cannot open this link");
      return;
    }

    await Linking.openURL(item.url);
  }

  async function deleteItem(item: StashItem) {
    if (!data) return;
    const next = hideItem(data, item.id);
    await updateData(next);
    setSelectedItemId(null);
    setNotice("Removed");
  }

  async function moveItem(item: StashItem, basketId: string) {
    if (!data || item.basketId === basketId) return;
    const moved = { ...item, basketId };
    await updateData(upsertItem(data, moved));
    setSelectedItemId(moved.id);
  }

  async function toggleSetting(key: "aiSuggestions" | "fetchLinkPreviews" | "privateItemsVisible", value: boolean) {
    if (!data) return;
    await updateData(updateSettings(data, { [key]: value }));
  }

  async function finishOnboarding(loadModel: boolean) {
    if (!data) return;

    if (loadModel && qvac.status !== "ready") {
      await startAssistant();
      if (!modelIdRef.current) return;
    }

    if (!loadModel) {
      autoStartedAssistantRef.current = true;
    }

    await updateData(updateSettings(data, { onboardingComplete: true }));
  }

  async function createBasket() {
    if (!data) return;
    const next = addBasket(data, newBasketName);
    await updateData(next);
    setNewBasketName("");
  }

  async function exportBackup(format: "json" | "markdown") {
    if (!data || backupBusy) return;

    setBackupBusy(format);
    try {
      const result = await exportStashBackup(data, format);
      if (!result) {
        const path = format === "json" ? await exportStashData(data) : await exportStashMarkdown(data);
        setNotice(`Saved inside app storage: ${path.replace(/^file:\/\//, "")}`);
        return;
      }
      setNotice(`${format === "json" ? "JSON backup" : "Markdown export"} saved`);
    } catch (error) {
      Alert.alert("Backup failed", error instanceof Error ? error.message : "The backup could not be written.");
    } finally {
      setBackupBusy(null);
    }
  }

  async function importBackup() {
    if (backupBusy) return;

    setBackupBusy("import");
    try {
      const imported = await importStashBackupFromDirectory();
      if (!imported) {
        setNotice("Import cancelled");
        return;
      }

      setBackupBusy(null);
      Alert.alert(
        "Import backup?",
        `Replace local data with ${imported.fileName}? This imports ${imported.data.items.length} saved item${imported.data.items.length === 1 ? "" : "s"}.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Import",
            onPress: () => {
              void applyImportedBackup(imported.data);
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert("Import failed", error instanceof Error ? error.message : "The backup could not be read.");
    } finally {
      setBackupBusy((current) => (current === "import" ? null : current));
    }
  }

  async function applyImportedBackup(imported: StashData) {
    await updateData(imported);
    setSelectedBasketId(undefined);
    setSelectedItemId(null);
    setForm((current) => ({ ...current, basketId: getInboxId(imported) ?? imported.baskets[0]?.id ?? "" }));
    setNotice("Backup imported");
  }

  async function resetLocalData() {
    const seed = createSeedData();
    await updateData(seed);
    setSelectedBasketId(undefined);
    setSelectedItemId(null);
    setForm((current) => ({ ...current, basketId: getInboxId(seed) ?? seed.baskets[0]?.id ?? "" }));
    setNotice("Local data cleared");
  }

  if (!data || (!fontsLoaded && !fontError)) {
    return (
      <View style={[styles.root, { paddingTop: androidTopInset }]}>
        <StatusBar style="dark" />
        <View style={styles.loadingShell}>
          <ActivityIndicator color={colors.green} />
          <Text style={styles.loadingText}>Opening Stash</Text>
        </View>
      </View>
    );
  }

  if (!data.settings.onboardingComplete) {
    const safeTop = Platform.OS === "android" ? androidTopInset + 10 : 18;

    return (
      <View style={styles.onboardingRoot}>
        <StatusBar style="light" />
        <ImageBackground source={ONBOARDING_BACKGROUND} resizeMode="cover" style={styles.onboardingBackground}>
          <View style={styles.onboardingImageShade} />
          <ScrollView
            contentContainerStyle={[
              styles.onboardingScroll,
              { minHeight: height, paddingTop: safeTop },
            ]}
          >
            <View style={[styles.onboardingShell, { width: contentWidth }]}>
              <View style={styles.onboardingBrandRow}>
                <Image accessibilityLabel="Stash logo" source={LOGO_IMAGE} style={styles.onboardingLogo} />
                <View style={styles.brandText}>
                  <Text style={styles.onboardingAppName}>Stash</Text>
                  <Text style={styles.onboardingTagline}>Save now. Find later.</Text>
                </View>
              </View>
              <View style={styles.onboardingPush} />
            <OnboardingPanel
              qvac={qvac}
              step={onboardingStep}
              onBack={() => setOnboardingStep((current) => Math.max(0, current - 1))}
              onNext={() => setOnboardingStep((current) => Math.min(2, current + 1))}
              onFinish={() => {
                void finishOnboarding(true);
              }}
              onEnter={() => {
                void finishOnboarding(false);
              }}
            />
            {notice ? <Notice text={notice} onDismiss={() => setNotice("")} /> : null}
          </View>
        </ScrollView>
        </ImageBackground>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: androidTopInset }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: 14 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.page, { width: contentWidth }]}>
            <Header />

            {saveOpen ? (
              <SavePanel
                baskets={baskets}
                busy={busy}
                form={form}
                onChange={setForm}
                onSave={() => {
                  void saveManualItem().then((saved) => {
                    if (saved) setSaveOpen(false);
                  });
                }}
              />
            ) : null}

            {notice ? <Notice text={notice} onDismiss={() => setNotice("")} /> : null}

            {mode === "search" ? null : <Tabs mode={mode} onChange={setMode} />}

            {mode === "map" ? (
              <MapPanel
                basketById={basketById}
                items={data.items.filter((item) => !item.deletedAt && !item.archived && (data.settings.privateItemsVisible || !item.isPrivate))}
                selectedItem={selectedItem}
                width={contentWidth}
                onSelect={setSelectedItemId}
              />
            ) : mode === "baskets" ? (
              <BasketPanel
                baskets={baskets}
                items={data.items}
                newBasketName={newBasketName}
                selectedBasketId={selectedBasketId}
                onCreateBasket={createBasket}
                onSelectBasket={(basketId) => {
                  setSelectedBasketId(basketId === selectedBasketId ? undefined : basketId);
                  setMode("library");
                }}
                onSetNewBasketName={setNewBasketName}
              />
            ) : mode === "settings" ? (
              <SettingsPanel
                backupBusy={backupBusy}
                data={data}
                qvac={qvac}
                onExportJson={() => {
                  void exportBackup("json");
                }}
                onExportMarkdown={() => {
                  void exportBackup("markdown");
                }}
                onImportJson={() => {
                  void importBackup();
                }}
                onReset={resetLocalData}
                onStartAssistant={startAssistant}
                onToggle={toggleSetting}
              />
            ) : (
              <Library
                assistantBusyId={assistantBusyId}
                basketById={basketById}
                baskets={baskets}
                items={visibleItems}
                metadataBusyId={metadataBusyId}
                mode={mode}
                query={query}
                selectedBasketId={selectedBasketId}
                selectedItem={selectedItem}
                onClearBasket={() => setSelectedBasketId(undefined)}
                onCopy={copyItem}
                onCopyLink={copyItemLink}
                onDelete={deleteItem}
                onEnrich={enrichMetadata}
                onMove={moveItem}
                onOpenLink={openItemLink}
                onRunAssistant={runAssistant}
                onSelect={setSelectedItemId}
                onCloseDetail={() => setSelectedItemId(null)}
                onShare={shareItem}
              />
            )}
          </View>
        </ScrollView>
        {mode === "search" ? (
          <View pointerEvents="box-none" style={styles.searchSheetWrap}>
            <SearchPanel
              baskets={baskets}
              selectedBasketId={selectedBasketId}
              selectedType={selectedSearchType}
              value={query}
              onChangeText={setQuery}
              onClose={() => {
                setMode("library");
              }}
              onClearFilters={() => {
                setQuery("");
                setSelectedBasketId(undefined);
                setSelectedSearchType("all");
              }}
              onSelectBasket={(basketId) => {
                setSelectedBasketId(basketId);
              }}
              onSelectType={(type) => {
                setSelectedSearchType(type);
              }}
            />
          </View>
        ) : null}
        <BottomCaptureBar
          contentWidth={contentWidth}
          searchOpen={mode === "search"}
          saveOpen={saveOpen}
          onOpenSave={() => setSaveOpen((current) => !current)}
          onToggleSearch={() => {
            setSaveOpen(false);
            setMode((current) => (current === "search" ? "library" : "search"));
          }}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image source={LOGO_IMAGE} style={styles.logo} resizeMode="cover" accessibilityLabel="Stash logo" />
        <View style={styles.brandText}>
          <Text style={styles.appName} numberOfLines={1} adjustsFontSizeToFit>
            Stash
          </Text>
          <Text style={styles.appTagline}>Save now. Find later.</Text>
        </View>
      </View>
    </View>
  );
}

function SavePanel({
  baskets,
  busy,
  form,
  onChange,
  onSave,
}: {
  baskets: Basket[];
  busy: boolean;
  form: SaveForm;
  onChange: (form: SaveForm) => void;
  onSave: () => void;
}) {
  return (
    <GlassPanel style={styles.savePanel}>
      <Text style={styles.sectionTitle}>Save</Text>
      <TextInput
        accessibilityLabel="Text or link to save"
        multiline
        placeholder="Paste a link, note, receipt text, or thought"
        placeholderTextColor={colors.faint}
        style={styles.saveInput}
        value={form.input}
        onChangeText={(input) => onChange({ ...form, input })}
      />
      <TextInput
        accessibilityLabel="Optional title"
        placeholder="Optional title"
        placeholderTextColor={colors.faint}
        style={styles.lineInput}
        value={form.title}
        onChangeText={(title) => onChange({ ...form, title })}
      />
      <View style={styles.basketChips}>
        {baskets.map((basket) => (
          <Chip
            key={basket.id}
            label={basket.name}
            selected={form.basketId === basket.id}
            onPress={() => onChange({ ...form, basketId: basket.id })}
          />
        ))}
      </View>
      <View style={styles.saveFooter}>
        <TextInput
          accessibilityLabel="Tags"
          placeholder="tags, separated, by commas"
          placeholderTextColor={colors.faint}
          style={[styles.lineInput, styles.tagsInput]}
          value={form.tags}
          onChangeText={(tags) => onChange({ ...form, tags })}
        />
        <View style={styles.privateToggle}>
          <Text style={styles.toggleLabel}>Private</Text>
          <Switch
            value={form.isPrivate}
            onValueChange={(isPrivate) => onChange({ ...form, isPrivate })}
            thumbColor={form.isPrivate ? colors.amber : colors.muted}
            trackColor={{ false: "#DDD9CC", true: "#FFE398" }}
          />
        </View>
      </View>
      <Button label="Save item" tone="primary" loading={busy} onPress={onSave} />
    </GlassPanel>
  );
}

function Tabs({ mode, onChange }: { mode: SearchMode; onChange: (mode: SearchMode) => void }) {
  const tabs: Array<{ icon: IconName; label: string; value: SearchMode }> = [
    { icon: "library", label: "Library", value: "library" },
    { icon: "map", label: "Map", value: "map" },
    { icon: "basket", label: "Baskets", value: "baskets" },
    { icon: "settings", label: "Settings", value: "settings" },
  ];

  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.value}
          accessibilityRole="button"
          style={[styles.tab, mode === tab.value ? styles.tabActive : null]}
          onPress={() => onChange(tab.value)}
        >
          <MiniIcon color={mode === tab.value ? colors.white : colors.muted} name={tab.icon} size={16} />
          <Text style={[styles.tabText, mode === tab.value ? styles.tabTextActive : null]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Library({
  assistantBusyId,
  basketById,
  baskets,
  items,
  metadataBusyId,
  mode,
  query,
  selectedBasketId,
  selectedItem,
  onClearBasket,
  onCopy,
  onCopyLink,
  onDelete,
  onEnrich,
  onMove,
  onOpenLink,
  onRunAssistant,
  onSelect,
  onCloseDetail,
  onShare,
}: {
  assistantBusyId: string | null;
  basketById: Map<string, Basket>;
  baskets: Basket[];
  items: StashItem[];
  metadataBusyId: string | null;
  mode: SearchMode;
  query: string;
  selectedBasketId?: string;
  selectedItem: StashItem | null;
  onClearBasket: () => void;
  onCopy: (item: StashItem) => void;
  onCopyLink: (item: StashItem) => void;
  onDelete: (item: StashItem) => void;
  onEnrich: (item: StashItem) => void;
  onMove: (item: StashItem, basketId: string) => void;
  onOpenLink: (item: StashItem) => void;
  onRunAssistant: (item: StashItem) => void;
  onSelect: (id: string) => void;
  onCloseDetail: () => void;
  onShare: (item: StashItem) => void;
}) {
  const title =
    mode === "search"
      ? "Exact matches"
      : selectedBasketId
        ? basketById.get(selectedBasketId)?.name ?? "Basket"
        : "Library";
  const showListHeader = items.length > 0 || Boolean(selectedBasketId) || mode === "search";

  return (
    <View style={styles.library}>
      {showListHeader ? (
        <View style={styles.listHeader}>
          <View>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.sectionMeta}>{items.length} saved item{items.length === 1 ? "" : "s"}</Text>
          </View>
          {selectedBasketId ? <Button label="All items" tone="quiet" onPress={onClearBasket} /> : null}
        </View>
      ) : null}

      {selectedItem ? (
        <DetailPanel
          assistantBusy={assistantBusyId === selectedItem.id}
          baskets={baskets}
          item={selectedItem}
          metadataBusy={metadataBusyId === selectedItem.id}
          selectedBasket={basketById.get(selectedItem.basketId)}
          onClose={onCloseDetail}
          onCopy={() => onCopy(selectedItem)}
          onCopyLink={() => onCopyLink(selectedItem)}
          onDelete={() => onDelete(selectedItem)}
          onEnrich={() => onEnrich(selectedItem)}
          onMove={(basketId) => onMove(selectedItem, basketId)}
          onOpenLink={() => onOpenLink(selectedItem)}
          onRunAssistant={() => onRunAssistant(selectedItem)}
          onShare={() => onShare(selectedItem)}
        />
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body={mode === "search" ? "Try another word, domain, basket, title, or tag." : "Share something from another app or save a link here."}
        />
      ) : (
        <View style={styles.itemGrid}>
          {items.map((item) => (
            <ItemCard
              key={item.id}
              basket={basketById.get(item.basketId)}
              item={item}
              selected={selectedItem?.id === item.id}
              variant="grid"
              onPress={() => onSelect(item.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ItemCard({
  basket,
  item,
  selected,
  variant = "full",
  onPress,
}: {
  basket?: Basket;
  item: StashItem;
  selected: boolean;
  variant?: "full" | "grid";
  onPress: (event: GestureResponderEvent) => void;
}) {
  const preview = cleanModelLine(item.summary, 180) ?? cleanModelLine(item.metadata?.description, 180) ?? item.body;
  const previewImage = previewImageForItem(item);

  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.itemCard, variant === "grid" ? styles.itemCardGrid : null, selected ? styles.itemCardSelected : null]}
      onPress={onPress}
    >
      {previewImage ? (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={`${item.title} preview image`}
          resizeMode="cover"
          source={{ uri: previewImage }}
          style={styles.itemPreviewImage}
        />
      ) : null}
      <View style={styles.itemTop}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
      <Text style={styles.itemPreview} numberOfLines={3}>
        {preview}
      </Text>
      <View style={styles.itemMetaRow}>
        {basket ? <Pill label={basket.name} /> : null}
        {item.domain ? <Pill label={item.domain} /> : null}
      </View>
    </Pressable>
  );
}

function DetailPanel({
  assistantBusy,
  baskets,
  item,
  metadataBusy,
  selectedBasket,
  onCopy,
  onCopyLink,
  onClose,
  onDelete,
  onEnrich,
  onMove,
  onOpenLink,
  onRunAssistant,
  onShare,
}: {
  assistantBusy: boolean;
  baskets: Basket[];
  item: StashItem;
  metadataBusy: boolean;
  selectedBasket?: Basket;
  onCopy: () => void;
  onCopyLink: () => void;
  onClose: () => void;
  onDelete: () => void;
  onEnrich: () => void;
  onMove: (basketId: string) => void;
  onOpenLink: () => void;
  onRunAssistant: () => void;
  onShare: () => void;
}) {
  const displaySummary = cleanModelLine(item.summary, 180);
  const previewImage = previewImageForItem(item);

  return (
    <GlassPanel style={styles.detailPanel}>
      <Text style={styles.detailKicker}>{selectedBasket?.name ?? "Saved"}</Text>
      {previewImage ? (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={`${item.title} preview image`}
          resizeMode="cover"
          source={{ uri: previewImage }}
          style={styles.detailPreviewImage}
        />
      ) : null}
      <Text style={styles.detailTitle}>{item.title}</Text>
      {item.url ? <Text style={styles.detailUrl}>{item.url}</Text> : null}
      <View style={styles.detailIconRow}>
        <IconButton label="Close" name="close" onPress={onClose} />
        <IconButton label="Copy" name="copy" onPress={onCopy} />
        <IconButton label="Share" name="share" onPress={onShare} />
        {item.url ? <IconButton label="Copy link" name="link" onPress={onCopyLink} /> : null}
        {item.url ? <IconButton label="Open link" name="open" onPress={onOpenLink} /> : null}
        <IconButton
          danger
          label="Remove"
          name="delete"
          onPress={() =>
            Alert.alert("Remove item?", "This hides the saved item from your library.", [
              { text: "Keep", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: onDelete },
            ])
          }
        />
      </View>
      <Text style={styles.detailBody}>{item.body}</Text>
      {displaySummary ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Summary</Text>
          <Text style={styles.summaryText}>{displaySummary}</Text>
        </View>
      ) : null}
      {item.userTags.length || item.aiTags.length ? (
        <View style={styles.itemMetaRow}>
          {[...item.userTags, ...item.aiTags].map((tag) => (
            <Pill key={tag} label={`#${tag}`} />
          ))}
        </View>
      ) : null}
      <View style={styles.actionGrid}>
        {item.url ? <Button icon="preview" label="Fetch preview" tone="quiet" loading={metadataBusy} onPress={onEnrich} /> : null}
        <Button icon="sort" label="Sort now" tone="quiet" loading={assistantBusy} onPress={onRunAssistant} />
      </View>
      <Text style={styles.subLabel}>Move to</Text>
      <View style={styles.basketChips}>
        {baskets.map((basket) => (
          <Chip
            key={basket.id}
            label={basket.name}
            selected={item.basketId === basket.id}
            onPress={() => onMove(basket.id)}
          />
        ))}
      </View>
    </GlassPanel>
  );
}

function BasketPanel({
  baskets,
  items,
  newBasketName,
  selectedBasketId,
  onCreateBasket,
  onSelectBasket,
  onSetNewBasketName,
}: {
  baskets: Basket[];
  items: StashItem[];
  newBasketName: string;
  selectedBasketId?: string;
  onCreateBasket: () => void;
  onSelectBasket: (basketId: string) => void;
  onSetNewBasketName: (value: string) => void;
}) {
  return (
    <View style={styles.library}>
      <Text style={styles.sectionTitle}>Baskets</Text>
      <View style={styles.newBasketRow}>
        <TextInput
          accessibilityLabel="New basket name"
          placeholder="New basket"
          placeholderTextColor={colors.faint}
          style={[styles.lineInput, styles.newBasketInput]}
          value={newBasketName}
          onChangeText={onSetNewBasketName}
        />
        <Button icon="plus" label="Add" tone="primary" onPress={onCreateBasket} />
      </View>
      {!baskets.length ? (
        <EmptyState title="No baskets yet" body="Create baskets for topics you care about. New saves can be sorted into them." />
      ) : null}
      {baskets.map((basket) => {
        const count = items.filter((item) => item.basketId === basket.id && !item.deletedAt && !item.archived).length;
        return (
          <Pressable
            key={basket.id}
            accessibilityRole="button"
            style={[styles.basketRow, selectedBasketId === basket.id ? styles.basketRowActive : null]}
            onPress={() => onSelectBasket(basket.id)}
          >
            <Text style={styles.basketName}>{basket.name}</Text>
            <Text style={styles.basketCount}>{count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingsPanel({
  backupBusy,
  data,
  qvac,
  onExportJson,
  onExportMarkdown,
  onImportJson,
  onReset,
  onStartAssistant,
  onToggle,
}: {
  backupBusy: "json" | "markdown" | "import" | null;
  data: StashData;
  qvac: QvacState;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onImportJson: () => void;
  onReset: () => void;
  onStartAssistant: () => void;
  onToggle: (key: "aiSuggestions" | "fetchLinkPreviews" | "privateItemsVisible", value: boolean) => void;
}) {
  const assistantWorking = qvac.status === "downloading" || qvac.status === "loading";

  return (
    <View style={styles.library}>
      <Text style={styles.sectionTitle}>Settings</Text>
      <View style={styles.settingsGroup}>
        <SettingRow
          icon="privacy"
          label="Show private items"
          body="Hidden saves appear only after this is on."
          value={data.settings.privateItemsVisible}
          onValueChange={(value) => onToggle("privateItemsVisible", value)}
        />
        <SettingRow
          icon="preview"
          label="Link previews"
          body="Download titles, descriptions, and images for saved links."
          value={data.settings.fetchLinkPreviews}
          onValueChange={(value) => onToggle("fetchLinkPreviews", value)}
        />
        <StatusRow
          icon="sort"
          label="On-device sorting"
          body={sortingStatusText(qvac)}
          tone={qvac.status === "ready" ? "green" : qvac.status === "error" ? "danger" : "quiet"}
        />
        <Button
          icon="sort"
          label={
            qvac.status === "ready"
              ? "Sorting ready"
              : assistantWorking && qvac.progress !== null
                ? `${qvac.progress}%`
                : "Prepare sorting"
          }
          tone="quiet"
          loading={assistantWorking}
          onPress={onStartAssistant}
        />
      </View>

      <View style={styles.backupPanel}>
        <Text style={styles.sectionTitle}>Backup</Text>
        <View style={styles.backupNotice}>
          <Text style={styles.backupNoticeText}>Export your saved items, baskets, tags, and link metadata. Import JSON later to restore this phone.</Text>
        </View>

        <View style={styles.backupSection}>
          <Text style={styles.settingLabel}>JSON Backup</Text>
          <Text style={styles.settingBody}>Use this to move or restore your full library.</Text>
          <View style={styles.backupActions}>
            <Button icon="backup" label="Export JSON" tone="quiet" loading={backupBusy === "json"} onPress={onExportJson} />
            <Button icon="import" label="Import JSON" tone="quiet" loading={backupBusy === "import"} onPress={onImportJson} />
          </View>
        </View>

        <View style={styles.backupSection}>
          <Text style={styles.settingLabel}>Markdown Backup</Text>
          <Text style={styles.settingBody}>Readable notes grouped by basket.</Text>
          <Button icon="markdown" label="Export Markdown" tone="quiet" loading={backupBusy === "markdown"} onPress={onExportMarkdown} />
        </View>
      </View>

      <Button
        icon="delete"
        label="Reset local data"
        tone="danger"
        onPress={() =>
          Alert.alert("Clear local data?", "This removes saved items and keeps the default baskets.", [
            { text: "Cancel", style: "cancel" },
            { text: "Clear", style: "destructive", onPress: onReset },
          ])
        }
      />
    </View>
  );
}

const ONBOARDING_STEPS = [
  {
    body: "Paste a note or link, or share text from another app. Stash saves it locally first so capture stays fast.",
    bullets: ["Manual save", "Android share sheet", "Local storage"],
    title: "Save first",
  },
  {
    body: "Use Search for exact words, then filter by type or basket. Link previews and tags make saved items easier to recognize at a glance.",
    bullets: ["Keyword search", "Type filters", "Baskets"],
    title: "Find it later",
  },
  {
    body: "Load local sorting to let QVAC summarize, tag, and choose baskets on this phone after each save. Stash also keeps a local backup file and exports JSON from Settings.",
    bullets: ["Local model", "Automatic backup", "JSON export"],
    title: "Load sorting",
  },
];

function OnboardingPanel({
  qvac,
  step,
  onBack,
  onEnter,
  onFinish,
  onNext,
}: {
  qvac: QvacState;
  step: number;
  onBack: () => void;
  onEnter: () => void;
  onFinish: () => void;
  onNext: () => void;
}) {
  const current = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS[0];
  const lastStep = step === ONBOARDING_STEPS.length - 1;
  const modelWorking = qvac.status === "downloading" || qvac.status === "loading";
  const modelReady = qvac.status === "ready";

  return (
    <GlassPanel style={styles.onboardingPanel}>
      <Text style={styles.onboardingKicker}>{step + 1} of {ONBOARDING_STEPS.length}</Text>
      <Text style={styles.onboardingTitle}>{current.title}</Text>
      <Text style={styles.onboardingBody}>{current.body}</Text>
      <View style={styles.onboardingBullets}>
        {current.bullets.map((bullet) => (
          <View key={bullet} style={styles.onboardingBullet}>
            <View style={styles.onboardingDot} />
            <Text style={styles.onboardingBulletText}>{bullet}</Text>
          </View>
        ))}
      </View>
      {lastStep ? (
        <View style={styles.onboardingStatus}>
          <Text style={styles.onboardingStatusLabel}>Sorting status</Text>
          <Text style={styles.onboardingStatusText}>{onboardingModelStatus(qvac)}</Text>
        </View>
      ) : null}
      <View style={styles.onboardingActions}>
        {step > 0 ? <Button label="Back" tone="quiet" onPress={onBack} /> : null}
        {lastStep ? (
          <>
            <Button
              label={modelReady ? "Enter Stash" : modelWorking && qvac.progress !== null ? `${qvac.progress}%` : "Load sorting"}
              tone="primary"
              loading={modelWorking}
              onPress={modelReady ? onEnter : onFinish}
            />
            <Button label="Open app" tone="quiet" onPress={onEnter} />
          </>
        ) : (
          <Button label="Next" tone="primary" onPress={onNext} />
        )}
      </View>
    </GlassPanel>
  );
}

function SearchPanel({
  baskets,
  selectedBasketId,
  selectedType,
  value,
  onChangeText,
  onClose,
  onClearFilters,
  onSelectBasket,
  onSelectType,
}: {
  baskets: Basket[];
  selectedBasketId?: string;
  selectedType: StashItemType | "all";
  value: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onClearFilters: () => void;
  onSelectBasket: (basketId: string | undefined) => void;
  onSelectType: (type: StashItemType | "all") => void;
}) {
  const typeFilters: Array<{ label: string; value: StashItemType | "all" }> = [
    { label: "All", value: "all" },
    { label: "Text", value: "text" },
    { label: "Links", value: "link" },
    { label: "Notes", value: "note" },
    { label: "Images", value: "screenshot" },
  ];

  return (
    <View style={styles.searchPanel}>
      <View style={styles.searchHandleRow}>
        <View style={styles.searchHandle} />
        <Pressable accessibilityLabel="Close search" accessibilityRole="button" style={styles.searchCloseButton} onPress={onClose}>
          <MiniIcon color={colors.white} name="close" size={15} />
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel="Search saved items"
        placeholder="Search your baskets..."
        placeholderTextColor="rgba(255,255,255,0.58)"
        returnKeyType="search"
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
      />
      <View style={styles.searchFilterBlock}>
        <Text style={styles.searchGroupLabel}>Filter by type</Text>
        <View style={styles.basketChips}>
          {typeFilters.map((filter) => (
            <Chip
              key={filter.value}
              label={filter.label}
              selected={selectedType === filter.value}
              tone="dark"
              onPress={() => onSelectType(filter.value)}
            />
          ))}
        </View>
      </View>
      <View style={styles.searchFilterBlock}>
        <Text style={styles.searchGroupLabel}>Filter by basket</Text>
        <View style={styles.basketChips}>
          <Chip label="All" selected={!selectedBasketId} tone="dark" onPress={() => onSelectBasket(undefined)} />
          {baskets.map((basket) => (
            <Chip
              key={basket.id}
              label={basket.name}
              selected={selectedBasketId === basket.id}
              tone="dark"
              onPress={() => onSelectBasket(selectedBasketId === basket.id ? undefined : basket.id)}
            />
          ))}
        </View>
      </View>
      <Button icon="delete" label="Clear" tone="quiet" onPress={onClearFilters} />
    </View>
  );
}

type GraphNode = {
  id: string;
  item: StashItem;
  label: string;
  x: number;
  y: number;
};

type GraphEdge = {
  from: string;
  reason: string;
  to: string;
  weight: number;
};

function MapPanel({
  basketById,
  items,
  selectedItem,
  width,
  onSelect,
}: {
  basketById: Map<string, Basket>;
  items: StashItem[];
  selectedItem: StashItem | null;
  width: number;
  onSelect: (id: string) => void;
}) {
  const canvasWidth = Math.max(300, width - 34);
  const graph = useMemo(() => buildGraph(items, basketById, canvasWidth), [basketById, canvasWidth, items]);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.setValue(0);
    Animated.spring(entrance, {
      damping: 16,
      mass: 0.9,
      stiffness: 92,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [entrance, graph.nodes.length]);

  return (
    <View style={styles.library}>
      <View style={styles.listHeader}>
        <View>
          <Text style={styles.sectionTitle}>Map</Text>
          <Text style={styles.sectionMeta}>{graph.nodes.length} saved item{graph.nodes.length === 1 ? "" : "s"} connected by basket, tag, and domain</Text>
        </View>
      </View>
      <GlassPanel style={styles.mapPanel}>
        {graph.nodes.length ? (
          <View style={[styles.mapCanvas, { width: canvasWidth }]}>
            {graph.edges.map((edge) => {
              const from = graph.nodeById.get(edge.from);
              const to = graph.nodeById.get(edge.to);
              if (!from || !to) return null;
              return <MapEdge key={`${edge.from}-${edge.to}`} entrance={entrance} from={from} to={to} weight={edge.weight} />;
            })}
            {graph.nodes.map((node) => (
              <Animated.View
                key={node.id}
                style={[
                  {
                    left: node.x - graph.nodeSize / 2,
                    top: node.y - graph.nodeSize / 2,
                    transform: [
                      {
                        translateX: entrance.interpolate({
                          inputRange: [0, 1],
                          outputRange: [canvasWidth / 2 - node.x, 0],
                        }),
                      },
                      {
                        translateY: entrance.interpolate({
                          inputRange: [0, 1],
                          outputRange: [205 - node.y, 0],
                        }),
                      },
                      {
                        scale: entrance.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.38, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${node.item.title}`}
                  style={[
                    styles.mapNode,
                    {
                      borderRadius: graph.nodeSize / 2,
                      height: graph.nodeSize,
                      width: graph.nodeSize,
                    },
                    selectedItem?.id === node.id ? styles.mapNodeSelected : null,
                  ]}
                  onPress={() => onSelect(node.id)}
                >
                  <Text style={[styles.mapNodeText, { fontSize: graph.nodeFontSize, lineHeight: graph.nodeFontSize + 3 }]} numberOfLines={2}>
                    {node.label}
                  </Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        ) : (
          <EmptyState title="No map yet" body="Save a few links or notes and Stash will connect related items here." />
        )}
      </GlassPanel>
      {selectedItem ? (
        <View style={styles.mapSelection}>
          <Text style={styles.subLabel}>Selected</Text>
          <ItemCard
            basket={basketById.get(selectedItem.basketId)}
            item={selectedItem}
            selected
            onPress={() => onSelect(selectedItem.id)}
          />
        </View>
      ) : null}
    </View>
  );
}

function MapEdge({ entrance, from, to, weight }: { entrance: Animated.Value; from: GraphNode; to: GraphNode; weight: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const angle = Math.atan2(dy, dx);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.mapEdge,
        {
          left: from.x,
          opacity: entrance.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.min(0.62, 0.22 + weight * 0.12)],
          }),
          top: from.y,
          transform: [{ rotate: `${angle}rad` }, { scaleX: entrance }],
          transformOrigin: "0px 1px",
          width: length,
        } as object,
      ]}
    />
  );
}

function buildGraph(items: StashItem[], basketById: Map<string, Basket>, canvasWidth: number) {
  const graphItems = items.slice(0, 18);
  const canvasHeight = 410;
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const nodeSize = graphNodeSize(graphItems.length);
  const nodeFontSize = graphNodeFontSize(graphItems.length);
  const radiusX = Math.max(82, canvasWidth / 2 - nodeSize / 2 - 14);
  const radiusY = Math.max(112, canvasHeight / 2 - nodeSize / 2 - 28);

  const nodes = graphItems.map((item, index) => {
    const angle = graphItems.length === 1 ? 0 : (index / graphItems.length) * Math.PI * 2 - Math.PI / 2;
    return {
      id: item.id,
      item,
      label: shortNodeLabel(item.title),
      x: graphItems.length === 1 ? centerX : centerX + Math.cos(angle) * radiusX,
      y: graphItems.length === 1 ? centerY : centerY + Math.sin(angle) * radiusY,
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: GraphEdge[] = [];

  for (let left = 0; left < graphItems.length; left += 1) {
    for (let right = left + 1; right < graphItems.length; right += 1) {
      const connection = connectionWeight(graphItems[left], graphItems[right], basketById);
      if (connection.weight > 0) {
        edges.push({
          from: graphItems[left].id,
          reason: connection.reason,
          to: graphItems[right].id,
          weight: connection.weight,
        });
      }
    }
  }

  return {
    edges: edges.sort((left, right) => right.weight - left.weight).slice(0, 34),
    nodeById,
    nodeFontSize,
    nodeSize,
    nodes,
  };
}

function graphNodeSize(count: number) {
  if (count <= 4) return 76;
  if (count <= 8) return 64;
  if (count <= 12) return 56;
  return 48;
}

function graphNodeFontSize(count: number) {
  if (count <= 4) return 10;
  if (count <= 8) return 9;
  return 8;
}

function connectionWeight(left: StashItem, right: StashItem, basketById: Map<string, Basket>) {
  let weight = 0;
  const reasons: string[] = [];

  if (left.basketId === right.basketId) {
    weight += 2;
    reasons.push(basketById.get(left.basketId)?.name ?? "same basket");
  }

  if (left.domain && right.domain && left.domain === right.domain) {
    weight += 3;
    reasons.push(left.domain);
  }

  const leftTags = new Set([...left.userTags, ...left.aiTags].map((tag) => tag.toLowerCase()));
  const sharedTags = [...right.userTags, ...right.aiTags].filter((tag) => leftTags.has(tag.toLowerCase()));
  if (sharedTags.length) {
    weight += Math.min(3, sharedTags.length + 1);
    reasons.push(`#${sharedTags[0]}`);
  }

  const sharedWords = sharedMeaningWords(left, right);
  if (sharedWords.length >= 2) {
    weight += 1;
    reasons.push(sharedWords[0]);
  }

  return {
    reason: reasons.slice(0, 2).join(", "),
    weight,
  };
}

function sharedMeaningWords(left: StashItem, right: StashItem) {
  const leftWords = new Set(searchableWords(left));
  return searchableWords(right).filter((word) => leftWords.has(word)).slice(0, 3);
}

function searchableWords(item: StashItem) {
  return [
    item.title,
    item.summary,
    item.metadata?.title,
    item.metadata?.description,
    item.domain,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4 && !COMMON_GRAPH_WORDS.has(word));
}

function shortNodeLabel(title: string) {
  const clean = cleanModelLine(title, 34) ?? "Saved item";
  return clean.length > 30 ? `${clean.slice(0, 27)}...` : clean;
}

const COMMON_GRAPH_WORDS = new Set([
  "about",
  "after",
  "again",
  "article",
  "saved",
  "service",
  "services",
  "their",
  "there",
  "these",
  "thing",
  "where",
  "which",
  "would",
]);

function SettingRow({
  body,
  icon,
  label,
  value,
  onValueChange,
}: {
  body: string;
  icon: IconName;
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <MiniIcon color={colors.text} name={icon} size={18} />
      </View>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingBody}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={value ? colors.green : colors.muted}
        trackColor={{ false: "#DDD9CC", true: "#BEECCF" }}
      />
    </View>
  );
}

function StatusRow({ body, icon, label, tone }: { body: string; icon: IconName; label: string; tone: "quiet" | "green" | "danger" }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <MiniIcon color={colors.text} name={icon} size={18} />
      </View>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingBody}>{body}</Text>
      </View>
      <Pill label={tone === "green" ? "ready" : tone === "danger" ? "retry" : "working"} tone={tone === "green" ? "quiet" : tone === "danger" ? "amber" : "blue"} />
    </View>
  );
}

function EmptyState({
  actionLabel,
  body,
  onAction,
  title,
}: {
  actionLabel?: string;
  body: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <View style={styles.emptyIconLid} />
        <View style={styles.emptyIconBox} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} tone="primary" onPress={onAction} /> : null}
    </View>
  );
}

function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={styles.notice} onPress={onDismiss}>
      <Text style={styles.noticeText}>{text}</Text>
      <Text style={styles.noticeDismiss}>Dismiss</Text>
    </Pressable>
  );
}

function GlassPanel({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.glassOuter, style]}>
      <View style={styles.glassInner}>
        <View style={styles.glassShine} pointerEvents="none" />
        {children}
      </View>
    </View>
  );
}

function IconButton({
  danger,
  label,
  name,
  onPress,
}: {
  danger?: boolean;
  label: string;
  name: IconName;
  onPress: () => void;
}) {
  const tint = danger ? colors.red : colors.text;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [styles.iconButton, danger ? styles.iconButtonDanger : null, pressed ? styles.buttonPressed : null]}
      onPress={onPress}
    >
      <MiniIcon color={tint} name={name} size={18} />
    </Pressable>
  );
}

const ICON_MAP: Record<IconName, ComponentProps<typeof MaterialIcons>["name"]> = {
  backup: "backup",
  basket: "shopping-basket",
  close: "close",
  copy: "content-copy",
  delete: "delete-outline",
  import: "file-download",
  json: "data-object",
  library: "dashboard",
  link: "link",
  map: "account-tree",
  markdown: "article",
  open: "open-in-new",
  plus: "add",
  preview: "image",
  privacy: "lock",
  save: "bookmark-border",
  search: "search",
  settings: "settings",
  share: "share",
  sort: "tune",
};

function MiniIcon({ color = colors.text, name, size = 18 }: { color?: string; name: IconName; size?: number }) {
  return <MaterialIcons color={color} name={ICON_MAP[name] ?? "radio-button-unchecked"} size={size} />;
}

function BottomCaptureBar({
  contentWidth,
  searchOpen,
  saveOpen,
  onOpenSave,
  onToggleSearch,
}: {
  contentWidth: number;
  searchOpen: boolean;
  saveOpen: boolean;
  onOpenSave: () => void;
  onToggleSearch: () => void;
}) {
  return (
    <View pointerEvents="box-none" style={styles.bottomDockWrap}>
      <View style={[styles.bottomDock, { width: contentWidth }]}>
        <Pressable accessibilityRole="button" style={styles.dockSaveButton} onPress={onOpenSave}>
          <MiniIcon color={colors.white} name={saveOpen ? "delete" : "save"} size={18} />
          <Text style={styles.dockSaveText}>{saveOpen ? "Close" : "Save"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.dockSearchButton} onPress={onToggleSearch}>
          <MiniIcon color={colors.muted} name={searchOpen ? "library" : "search"} size={18} />
          <Text style={styles.dockSearchText} numberOfLines={1}>
            {searchOpen ? "Back to library" : "Find saved items"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Button({
  icon,
  label,
  loading,
  onPress,
  tone = "quiet",
}: {
  icon?: IconName;
  label: string;
  loading?: boolean;
  onPress: () => void;
  tone?: "primary" | "quiet" | "green" | "amber" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      style={({ pressed }) => [
        styles.button,
        tone === "primary" ? styles.buttonPrimary : null,
        tone === "green" ? styles.buttonGreen : null,
        tone === "amber" ? styles.buttonAmber : null,
        tone === "danger" ? styles.buttonDanger : null,
        pressed ? styles.buttonPressed : null,
        loading ? styles.buttonDisabled : null,
      ]}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator color={tone === "primary" ? colors.white : colors.text} size="small" /> : null}
      {!loading && icon ? <MiniIcon color={tone === "primary" ? colors.white : colors.text} name={icon} size={16} /> : null}
      <Text style={[styles.buttonText, tone === "primary" ? styles.buttonPrimaryText : null]}>{label}</Text>
    </Pressable>
  );
}

function Chip({
  label,
  selected,
  tone = "light",
  onPress,
}: {
  label: string;
  selected: boolean;
  tone?: "light" | "dark";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[
        styles.chip,
        tone === "dark" ? styles.chipDark : null,
        selected ? styles.chipSelected : null,
        tone === "dark" && selected ? styles.chipDarkSelected : null,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.chipText,
          tone === "dark" ? styles.chipTextDark : null,
          selected ? styles.chipTextSelected : null,
          tone === "dark" && selected ? styles.chipTextDarkSelected : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Pill({ label, tone = "quiet" }: { label: string; tone?: "quiet" | "amber" | "blue" }) {
  return (
    <View style={[styles.pill, tone === "amber" ? styles.pillAmber : null, tone === "blue" ? styles.pillBlue : null]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function previewImageForItem(item: StashItem) {
  const image = item.metadata?.cachedImageUri ?? item.metadata?.imageUrl;
  if (image?.startsWith("file://")) return image;
  return isSafeRemoteUrl(image) ? image : null;
}

async function cachePreviewImage(itemId: string, imageUrl?: string) {
  if (!imageUrl || !isSafeRemoteUrl(imageUrl)) return null;
  const safeImageUrl = imageUrl;

  try {
    const directory = await FileSystem.getInfoAsync(PREVIEW_CACHE_DIR);
    if (!directory.exists) {
      await FileSystem.makeDirectoryAsync(PREVIEW_CACHE_DIR, { intermediates: true });
    }

    const extension = imageExtensionFromUrl(safeImageUrl);
    const fileUri = `${PREVIEW_CACHE_DIR}${itemId}.${extension}`;
    const existing = await FileSystem.getInfoAsync(fileUri);
    if (existing.exists) return fileUri;

    const result = await FileSystem.downloadAsync(safeImageUrl, fileUri, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Stash/1.0",
      },
    });

    return result.status >= 200 && result.status < 300 ? result.uri : null;
  } catch {
    return null;
  }
}

function imageExtensionFromUrl(url: string) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const extension = path.match(/\.(jpg|jpeg|png|webp|gif)$/)?.[1];
    return extension === "jpeg" ? "jpg" : extension ?? "jpg";
  } catch {
    return "jpg";
  }
}

function isPlainTitle(title: string) {
  return title.length < 40 && !/[.!?]/.test(title);
}

function sortingStatusText(qvac: QvacState) {
  if (qvac.status === "ready") return "QVAC is ready to summarize, tag, and basket saved items on this phone.";
  if (qvac.status === "downloading" || qvac.status === "loading") {
    return `${qvac.message}${qvac.progress !== null ? `: ${qvac.progress}%` : ""}`;
  }
  if (qvac.status === "error") return "QVAC could not start. Try preparing sorting again.";
  return "QVAC starts in the background and organizes new saves after they are stored.";
}

function onboardingModelStatus(qvac: QvacState) {
  if (qvac.status === "ready") return "Ready. New saves can be summarized, tagged, and sorted.";
  if (qvac.status === "downloading" || qvac.status === "loading") {
    return `${qvac.message}${qvac.progress !== null ? `: ${qvac.progress}%` : ""}`;
  }
  if (qvac.status === "error") return "Could not load. Check connection and try again.";
  return "Not loaded yet. Load sorting once to prepare the local model.";
}

const styles = StyleSheet.create({
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  appName: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: 0,
  },
  appTagline: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  basketChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  basketCount: {
    color: colors.green,
    fontSize: 15,
    fontWeight: "900",
  },
  basketName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  basketRow: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: 14,
  },
  basketRowActive: {
    borderColor: colors.green,
  },
  backupActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  backupNotice: {
    backgroundColor: "#FFF0BD",
    borderColor: colors.amber,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backupNoticeText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  backupPanel: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 13,
  },
  backupSection: {
    gap: 3,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  bottomDock: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    padding: 8,
    shadowColor: "#1F261F",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
  },
  bottomDockWrap: {
    alignItems: "center",
    backgroundColor: colors.background,
    paddingBottom: Platform.OS === "android" ? 18 : 24,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 13,
  },
  buttonAmber: {
    backgroundColor: "#FFF0BD",
    borderColor: colors.amber,
  },
  buttonDanger: {
    backgroundColor: "#FFF0ED",
    borderColor: "#F2AAA4",
  },
  buttonDisabled: {
    opacity: 0.74,
  },
  buttonGreen: {
    backgroundColor: "#E8F8EF",
    borderColor: colors.green,
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
  },
  buttonPrimary: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  buttonPrimaryText: {
    color: colors.white,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  chip: {
    backgroundColor: colors.panel,
    borderColor: colors.stroke,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipDark: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  chipDarkSelected: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  chipSelected: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  chipTextDark: {
    color: "rgba(255,255,255,0.78)",
  },
  chipTextDarkSelected: {
    color: colors.ink,
  },
  chipTextSelected: {
    color: colors.ink,
  },
  detailBody: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22,
    marginTop: 12,
  },
  detailKicker: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  detailPanel: {
    marginTop: 12,
  },
  detailIconRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  detailPreviewImage: {
    backgroundColor: colors.panelStrong,
    borderRadius: 8,
    height: 190,
    marginTop: 12,
    width: "100%",
  },
  detailTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 28,
    marginTop: 4,
  },
  detailUrl: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8,
  },
  dockSaveButton: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderColor: colors.text,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    width: 106,
  },
  dockSaveText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "900",
  },
  dockSearchButton: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 14,
  },
  dockSearchText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800",
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22,
    textAlign: "center",
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    minHeight: 250,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 34,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  emptyIcon: {
    alignItems: "center",
    height: 58,
    justifyContent: "center",
    marginBottom: 4,
    width: 72,
  },
  emptyIconBox: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderColor: colors.strokeStrong,
    borderTopWidth: 0,
    borderWidth: 3,
    height: 28,
    width: 52,
  },
  emptyIconLid: {
    borderColor: colors.strokeStrong,
    borderRadius: 8,
    borderWidth: 3,
    height: 16,
    transform: [{ rotate: "-10deg" }],
    width: 48,
  },
  glassInner: {
    borderRadius: 8,
    overflow: "hidden",
    padding: 16,
  },
  glassOuter: {
    backgroundColor: colors.panel,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  glassShine: {
    backgroundColor: "rgba(255,255,255,0.8)",
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  header: {
    gap: 0,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.panelSoft,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  iconButtonDanger: {
    backgroundColor: "#FFF0ED",
    borderColor: "#F2AAA4",
  },
  itemCard: {
    backgroundColor: colors.panel,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    overflow: "hidden",
    padding: 12,
  },
  itemCardGrid: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 156,
  },
  itemCardSelected: {
    borderColor: colors.green,
  },
  itemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  itemMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 2,
  },
  itemPreview: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  itemPreviewImage: {
    backgroundColor: colors.panelStrong,
    borderRadius: 7,
    height: 118,
    width: "100%",
  },
  itemTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
  },
  itemTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  keyboard: {
    flex: 1,
  },
  library: {
    gap: 12,
  },
  lineInput: {
    backgroundColor: colors.panel,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    minHeight: 46,
    paddingHorizontal: 12,
  },
  listHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  loadingShell: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  logo: {
    backgroundColor: colors.panelStrong,
    borderRadius: 8,
    height: 54,
    width: 54,
  },
  newBasketInput: {
    flex: 1,
  },
  newBasketRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  notice: {
    alignItems: "center",
    backgroundColor: "#E8F8EF",
    borderColor: "#A8E0BF",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 46,
    paddingHorizontal: 14,
  },
  noticeDismiss: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
  },
  noticeText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    paddingRight: 8,
  },
  mapCanvas: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.48)",
    borderColor: "rgba(45,51,79,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    height: 410,
    overflow: "hidden",
    position: "relative",
  },
  mapEdge: {
    backgroundColor: colors.greenDeep,
    borderRadius: 999,
    height: 2,
    position: "absolute",
  },
  mapNode: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    borderWidth: 2,
    height: 74,
    justifyContent: "center",
    paddingHorizontal: 8,
    position: "absolute",
    width: 74,
  },
  mapNodeSelected: {
    backgroundColor: colors.greenDeep,
    borderColor: colors.amber,
  },
  mapNodeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13,
    textAlign: "center",
  },
  mapPanel: {
    marginTop: -2,
  },
  mapSelection: {
    gap: 8,
  },
  onboardingActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  onboardingBody: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginTop: 10,
  },
  onboardingBullet: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderColor: colors.stroke,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  onboardingBullets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  onboardingBulletText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  onboardingDot: {
    backgroundColor: colors.green,
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  onboardingKicker: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  onboardingPanel: {
    marginBottom: 10,
  },
  onboardingAppName: {
    color: colors.white,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
  },
  onboardingBackground: {
    flex: 1,
  },
  onboardingBrandRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(17,19,31,0.42)",
    borderColor: "rgba(255,255,255,0.34)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 10,
  },
  onboardingImageShade: {
    backgroundColor: "rgba(17,19,31,0.24)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  onboardingLogo: {
    borderRadius: 8,
    height: 62,
    width: 62,
  },
  onboardingPush: {
    flex: 1,
    minHeight: 170,
  },
  onboardingRoot: {
    backgroundColor: colors.ink,
    flex: 1,
  },
  onboardingScroll: {
    alignItems: "center",
    paddingBottom: Platform.OS === "android" ? 24 : 30,
    paddingHorizontal: 16,
  },
  onboardingShell: {
    flex: 1,
    justifyContent: "space-between",
  },
  onboardingStatus: {
    backgroundColor: "#E8F8EF",
    borderColor: "#A8E0BF",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 12,
  },
  onboardingStatusLabel: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  onboardingStatusText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 4,
  },
  onboardingTitle: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900",
    lineHeight: 34,
    marginTop: 8,
  },
  onboardingTagline: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  page: {
    gap: 16,
  },
  pill: {
    backgroundColor: colors.panelStrong,
    borderColor: colors.stroke,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  pillAmber: {
    backgroundColor: "#FFF0BD",
    borderColor: colors.amber,
  },
  pillBlue: {
    backgroundColor: "#E9F0FA",
    borderColor: "#B8C9E4",
  },
  pillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  privateToggle: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 10,
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  saveFooter: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  saveInput: {
    backgroundColor: colors.panel,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    minHeight: 104,
    padding: 12,
    textAlignVertical: "top",
  },
  savePanel: {
    marginTop: 2,
  },
  scrollContent: {
    alignItems: "center",
    paddingBottom: 132,
    paddingHorizontal: 16,
  },
  searchCloseButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    top: 0,
    width: 36,
  },
  searchFilterBlock: {
    marginTop: 10,
  },
  searchGroupLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  searchInput: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchPanel: {
    backgroundColor: colors.text,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 740,
    padding: 12,
    width: "100%",
  },
  searchHandle: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.58)",
    borderRadius: 999,
    height: 4,
    width: 58,
  },
  searchHandleRow: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  searchSheetWrap: {
    alignItems: "center",
    bottom: Platform.OS === "android" ? 106 : 116,
    left: 0,
    paddingHorizontal: 16,
    position: "absolute",
    right: 0,
  },
  searchSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 12,
  },
  sectionMeta: {
    color: colors.faint,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 26,
  },
  settingBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    marginTop: 4,
  },
  settingIcon: {
    alignItems: "center",
    backgroundColor: colors.panelStrong,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  settingLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  settingRow: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 14,
  },
  settingText: {
    flex: 1,
  },
  settingsGroup: {
    gap: 10,
  },
  subLabel: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 16,
    textTransform: "uppercase",
  },
  summaryBox: {
    backgroundColor: "#E8F8EF",
    borderColor: "#A8E0BF",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  summaryLabel: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  summaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  tab: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    gap: 3,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 5,
    paddingVertical: 6,
  },
  tabActive: {
    backgroundColor: colors.text,
  },
  tabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  tabTextActive: {
    color: colors.white,
  },
  tabs: {
    backgroundColor: colors.panelStrong,
    borderColor: colors.stroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  tagsInput: {
    flex: 1,
    minWidth: 190,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
});

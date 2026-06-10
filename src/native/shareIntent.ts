import { NativeModules } from "react-native";

import type { IncomingShare } from "../domain/stash";

type ShareIntentModule = {
  consumeSharedText?: () => Promise<IncomingShare>;
};

const nativeModule = NativeModules.StashShareIntent as ShareIntentModule | undefined;

export async function consumeSharedText(): Promise<IncomingShare> {
  if (!nativeModule?.consumeSharedText) {
    return { hasShare: false };
  }

  try {
    return await nativeModule.consumeSharedText();
  } catch {
    return { hasShare: false };
  }
}

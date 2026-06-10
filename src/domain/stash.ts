export type StashItemType = "note" | "link" | "text" | "screenshot";

export type CaptureMethod = "manual" | "share";

export type LinkMetadataStatus = "idle" | "disabled" | "pending" | "fetched" | "failed";

export type LinkMetadata = {
  canonicalUrl?: string;
  description?: string;
  error?: string;
  faviconUrl?: string;
  fetchedAt?: string;
  cachedImageUri?: string;
  imageUrl?: string;
  siteName?: string;
  status: LinkMetadataStatus;
  title?: string;
};

export type AttachmentInfo = {
  height?: number;
  localUri?: string;
  mimeType?: string;
  ocrText?: string;
  thumbnailUri?: string;
  width?: number;
};

export type StashItem = {
  aiTags: string[];
  archived: boolean;
  attachment?: AttachmentInfo;
  basketId: string;
  body: string;
  captureMethod: CaptureMethod;
  createdAt: string;
  deletedAt: string | null;
  domain?: string;
  id: string;
  isPrivate: boolean;
  metadata?: LinkMetadata;
  pinned: boolean;
  sourceApp?: string;
  summary?: string;
  title: string;
  type: StashItemType;
  updatedAt: string;
  url?: string;
  userTags: string[];
};

export type Basket = {
  archived: boolean;
  createdAt: string;
  id: string;
  name: string;
  sortOrder: number;
  updatedAt: string;
};

export type StashSettings = {
  aiSuggestions: boolean;
  fetchLinkPreviews: boolean;
  onboardingComplete: boolean;
  privateItemsVisible: boolean;
};

export type StashData = {
  baskets: Basket[];
  items: StashItem[];
  schemaVersion: number;
  settings: StashSettings;
};

export type IncomingShare = {
  action?: string;
  hasShare: boolean;
  mimeType?: string;
  source?: string;
  subject?: string;
  text?: string;
};

export type ItemDraft = {
  basketId: string;
  body: string;
  captureMethod: CaptureMethod;
  isPrivate: boolean;
  sourceApp?: string;
  title: string;
  type: StashItemType;
  url?: string;
  userTags: string[];
};

export type SearchMode = "library" | "search" | "map" | "baskets" | "settings";

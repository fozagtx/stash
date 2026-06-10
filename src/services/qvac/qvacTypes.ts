export type QvacState = {
  modelId: string | null;
  status: "idle" | "downloading" | "loading" | "ready" | "error";
  message: string;
  progress: number | null;
};

export type QvacRunResult = {
  text: string;
};

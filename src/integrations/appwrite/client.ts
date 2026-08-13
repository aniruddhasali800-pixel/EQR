/**
 * Appwrite REST API Client
 * Provides a lightweight, zero-dependency Appwrite integration using fetch.
 * Stores configuration in localStorage for persistence across sessions.
 */

const APPWRITE_CONFIG_KEY = "cerp_appwrite_config";

export type AppwriteConfig = {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
  attendanceCollectionId: string;
  sessionsCollectionId: string;
  storageBucketId: string;
};

const DEFAULT_CONFIG: AppwriteConfig = {
  endpoint: "https://cloud.appwrite.io/v1",
  projectId: "",
  apiKey:
    "standard_baf1313fb15c5045598c5d4bc0745f74a1862f324e112d188fb0a41565b0046020f341d05baba78277a8a4bf9dfd76feb991e4b0e2c58c2faccf9837177d6652fb069b97cc4e2ba482c9f3971ee83f0773577fec7dddc247abca116224e8f24ec1a40543e912d96b9f3f698d0cefc34f419eb3c5f64f3d5e12d990c9aede4212",
  databaseId: "campus_erp_db",
  attendanceCollectionId: "attendance_records",
  sessionsCollectionId: "attendance_sessions",
  storageBucketId: "attendance_reports",
};

export function getAppwriteConfig(): AppwriteConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(APPWRITE_CONFIG_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppwriteConfig>;
      return { ...DEFAULT_CONFIG, ...saved };
    }
  } catch {
    // fallback
  }
  return DEFAULT_CONFIG;
}

export function saveAppwriteConfig(config: Partial<AppwriteConfig>): void {
  if (typeof window === "undefined") return;
  const current = getAppwriteConfig();
  const merged = { ...current, ...config };
  localStorage.setItem(APPWRITE_CONFIG_KEY, JSON.stringify(merged));
}

export function isAppwriteConfigured(): boolean {
  const config = getAppwriteConfig();
  return Boolean(config.endpoint && config.projectId && config.apiKey);
}

/**
 * Make an authenticated request to the Appwrite REST API.
 */
async function appwriteFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const config = getAppwriteConfig();
  const url = `${config.endpoint}${path}`;

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Appwrite-Project", config.projectId);
  headers.set("X-Appwrite-Key", config.apiKey);

  return fetch(url, { ...options, headers });
}

/**
 * Create a document in an Appwrite collection.
 */
export async function createDocument(
  databaseId: string,
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await appwriteFetch(
      `/databases/${databaseId}/collections/${collectionId}/documents`,
      {
        method: "POST",
        body: JSON.stringify({
          documentId,
          data,
        }),
      },
    );
    if (res.ok) return (await res.json()) as Record<string, unknown>;
    console.warn("[Appwrite] Create document failed:", res.status, await res.text());
    return null;
  } catch (err) {
    console.warn("[Appwrite] Create document error:", err);
    return null;
  }
}

/**
 * Upload a file to Appwrite Storage.
 */
export async function uploadFile(
  bucketId: string,
  fileId: string,
  file: File,
): Promise<{ fileId: string; url: string } | null> {
  const config = getAppwriteConfig();
  try {
    const formData = new FormData();
    formData.append("fileId", fileId);
    formData.append("file", file);

    const res = await fetch(`${config.endpoint}/storage/buckets/${bucketId}/files`, {
      method: "POST",
      headers: {
        "X-Appwrite-Project": config.projectId,
        "X-Appwrite-Key": config.apiKey,
      },
      body: formData,
    });

    if (res.ok) {
      const result = (await res.json()) as { $id: string };
      return {
        fileId: result.$id,
        url: `${config.endpoint}/storage/buckets/${bucketId}/files/${result.$id}/view?project=${config.projectId}`,
      };
    }
    console.warn("[Appwrite] Upload failed:", res.status, await res.text());
    return null;
  } catch (err) {
    console.warn("[Appwrite] Upload error:", err);
    return null;
  }
}

/**
 * Check if the Appwrite connection is reachable.
 */
export async function checkAppwriteHealth(): Promise<boolean> {
  if (!isAppwriteConfigured()) return false;
  try {
    const config = getAppwriteConfig();
    const res = await fetch(`${config.endpoint}/health`, {
      headers: { "X-Appwrite-Project": config.projectId },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

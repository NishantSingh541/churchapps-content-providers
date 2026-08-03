import { ContentFile, ContentItem, Instructions, InstructionItem } from "../../interfaces";
import { createFolder, createFile } from "../../utils";
import { CbnCatalogCategory , CbnCatalogCourse, CbnLesson, CbnLessonPlaylist, CbnThumb } from "./CbnInterfaces";

/**
 * Android release builds block plain HTTP (cleartext) network traffic by default.
 * CBN's API sometimes returns http:// URLs for otherwise-HTTPS-capable CDNs
 * (e.g. Brightcove), so force https:// here rather than loosening the app's
 * network security policy.
 */
function toHttps(url: string | null | undefined): string | null | undefined {
  if (typeof url === "string" && url.startsWith("http://")) {
    return "https://" + url.slice("http://".length);
  }
  return url;
}

/** Normalize a `thumb` (plain URL string or WordPress attachment object) to a URL string. */
export function resolveThumb(thumb: CbnThumb | null | undefined): string | undefined {
  if (typeof thumb === "string") return thumb || undefined;
  if (thumb && typeof thumb === "object") {
    // Prefer the original full-size image — WordPress's "medium" size is a
    // fixed-crop thumbnail (typically forced square), which is why images
    // were appearing cropped. Only fall back to it if no full URL exists.
    if (typeof thumb.url === "string") return thumb.url;
    const medium = thumb.sizes?.medium;
    if (typeof medium === "string") return medium;
  }
  return undefined;
}

/** Convert /catalog courses into folder items under /catalog */
/**
 * CBN's WordPress taxonomy still labels this category "K-6" internally,
 * but the app should display it as "Primary School" everywhere.
 */
function displayCategoryTitle(title: string): string {
  if (title.trim().toLowerCase() === "k-6") return "Primary School";
  return title;
}

export function convertCatalogToFolders(catalogs: CbnCatalogCategory[]): ContentItem[] {
  return catalogs.map(c => {
    const id = String(c.id);
    return createFolder(id, displayCategoryTitle(c.title), `/catalog/${id}`, resolveThumb(c.thumb));
  });
}
export function convertCoursesToFolders(courses: CbnCatalogCourse[],coursePath: string): ContentItem[] {
  return courses.map(c => {
    const id = String(c.id);
    return createFolder(id, c.title, `${coursePath}/${id}`, resolveThumb(c.thumb));
  });
}

/** Convert a course's lessons into leaf folder items under /catalog/{courseId} */
export function convertLessonsToFolders(lessons: CbnLesson[], coursePath: string): ContentItem[] {
  return lessons.map(l => {
    const id = String(l.id);
    // A lesson contains multiple individually-selectable videos (main
    // episode, Bible story, karaoke versions, etc.) — navigating into it
    // should show that video grid, not auto-play everything in sequence.
    const folder = createFolder(id, l.title, `${coursePath}/${id}`, resolveThumb(l.thumb));
    folder.browseAsGrid = true;
    return folder;
  });
}

/**
 * Convert a lesson playlist into ContentFile array.
 *
 * CBN resolves the Brightcove Playback API server-side and embeds a direct
 * progressive `mp4_url` on each item. We set `url`/`downloadUrl` to that MP4,
 * falling back to the Brightcove `playback_url` when CBN couldn't resolve one.
 * The raw Brightcove fields are kept in `providerData` so nothing is lost.
 */
/**
 * Brightcove's public Playback API can resolve a video's poster/thumbnail
 * image using only the account ID, video ID, and policy key already present
 * on each playlist item — no server secret required. CBN's own /lesson-playlist
 * response doesn't include a thumbnail per video, so we look it up ourselves.
 * Failures here are non-fatal: a missing thumbnail should never block playback.
 */
async function fetchBrightcoveThumbnail(accountId: string, videoId: string, policyKey: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://edge.api.brightcove.com/playback/v1/accounts/${accountId}/videos/${videoId}`, {
      headers: { "BCOV-POLICY": policyKey }
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    return data?.poster || data?.thumbnail || undefined;
  } catch {
    return undefined;
  }
}

export async function convertPlaylistToFiles(playlist: CbnLessonPlaylist): Promise<ContentFile[]> {
  const thumbnails = await Promise.all(
    playlist.playlist.map(v => fetchBrightcoveThumbnail(v.account_id, v.video_id, playlist.brightcove_policy_key))
  );

  return playlist.playlist.map((v, i) => {
    const file = createFile(v.video_id, v.title, toHttps(v.mp4_url) || toHttps(v.playback_url) || "", {
      mediaType: "video",
      thumbnail: thumbnails[i]
    });
    file.mediaId = v.video_id;
    file.downloadUrl = toHttps(v.mp4_url) ?? undefined;
    file.providerData = {
      brightcovePolicyKey: playlist.brightcove_policy_key,
      brightcoveAccountId: v.account_id,
      brightcoveVideoId: v.video_id,
      brightcovePlaybackUrl: toHttps(v.playback_url),
      brightcoveMp4Url: toHttps(v.mp4_url)
    };
    return file;
  });
}

/** Convert a lesson playlist into Instructions (mirrors APlayConverters.convertFilesToInstructions) */
export async function convertPlaylistToInstructions(playlist: CbnLessonPlaylist): Promise<Instructions> {
  const files = await convertPlaylistToFiles(playlist);
  const items: InstructionItem[] = files.map(file => ({
    id: file.id + "-action",
    itemType: "action",
    label: file.title,
    actionType: "play",
    children: [
      {
        id: file.id,
        itemType: "file",
        label: file.title,
        seconds: file.seconds,
        downloadUrl: file.url,
        thumbnail: file.thumbnail
      }
    ]
  }));
  return { name: playlist.lesson_title || "Lesson", items };
}

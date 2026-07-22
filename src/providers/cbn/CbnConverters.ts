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
    const medium = thumb.sizes?.medium;
    if (typeof medium === "string") return medium;
    if (typeof thumb.url === "string") return thumb.url;
  }
  return undefined;
}

/** Convert /catalog courses into folder items under /catalog */
export function convertCatalogToFolders(catalogs: CbnCatalogCategory[]): ContentItem[] {
  return catalogs.map(c => {
    const id = String(c.id);
    return createFolder(id, c.title, `/catalog/${id}`, resolveThumb(c.thumb));
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
    return createFolder(id, l.title, `${coursePath}/${id}`, resolveThumb(l.thumb), true);
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
export function convertPlaylistToFiles(playlist: CbnLessonPlaylist): ContentFile[] {
  return playlist.playlist.map(v => {
    const file = createFile(v.video_id, v.title, toHttps(v.mp4_url) || toHttps(v.playback_url) || "", {
      mediaType: "video",
      thumbnail: undefined
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
export function convertPlaylistToInstructions(playlist: CbnLessonPlaylist): Instructions {
  const files = convertPlaylistToFiles(playlist);
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

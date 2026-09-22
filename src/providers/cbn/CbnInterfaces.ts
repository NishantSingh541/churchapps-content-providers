/**
 * Typed shapes for the CBN FreePlay API responses.
 * Base: https://<host>/wp-json/superbook/v1
 */

/**
 * The API returns `thumb` either as a plain URL string or as a full WordPress
 * attachment object, depending on the course. Consumers should run it through
 * `resolveThumb` rather than using it directly.
 */
export type CbnThumb = string | { url?: string; sizes?: Record<string, unknown> };

/** A Category stub from GET /catalogs */
export interface CbnCatalogCategory {
  id: number;
  title: string;
  thumb: CbnThumb;
  detail_url: string;
}
/** A course stub from GET /catalog */
export interface CbnCatalogCourse {
  id: number;
  title: string;
  season: string;
  episode: string;
  lesson_count: number;
  video_count: number;
  thumb: CbnThumb;
  detail_url: string;
}

/** A lesson stub nested in a course detail response */
export interface CbnLesson {
  id: number;
  title: string;
  slug: string;
  lesson_number: string;
  video_count: number;
  thumb: CbnThumb;
  playlist_url: string;
}

/** Full course detail from GET /catalog/{course_id} */
export interface CbnCourseDetail {
  id: number;
  title: string;
  season: string;
  episode: string;
  summary: string;
  description: string;
  thumb: string;
  lesson_count: number;
  lessons: CbnLesson[];
}

/** A single video from a lesson playlist */
export interface CbnPlaylistVideo {
  title: string;
  video_id: string;
  account_id: string;
  playback_url: string;
  /** Direct progressive MP4 URL resolved server-side; null if unavailable. */
  mp4_url: string | null;
}

/** Full playlist from GET /lesson-playlist/{lesson_id} */
export interface CbnLessonPlaylist {
  brightcove_policy_key: string;
  course_id: number;
  course_title: string;
  course_season: string;
  course_episode: string;
  lesson_id: number;
  lesson_title: string;
  lesson_number: string;
  video_count: number;
  playlist: CbnPlaylistVideo[];
}

/** Course stub nested in a /today response */
export interface CbnTodayCourse {
  id: number;
  title: string;
  episode?: string;
  url?: string;
  thumb?: string;
}

/** Lesson stub nested in a /today response */
export interface CbnTodayLesson {
  id: number;
  title: string;
  lesson_number?: string;
  url?: string;
  thumb?: string;
}

/**
 * A schedule entry from GET /today?category={1|2}
 * category: 1 = Pre-School, 2 = Primary School.
 */
export interface CbnTodaySchedule {
  id: number;
  date: string;
  category: number | null;
  course: CbnTodayCourse;
  lesson: CbnTodayLesson;
  playlist: CbnLessonPlaylist;
}

/** Full response from GET /today */
export interface CbnTodayResponse {
  success: boolean;
  schedule: CbnTodaySchedule | null;
}

/**
 * A single enriched entry from GET /schedules — the whole shared,
 * org-wide calendar (past, current, and future), visible identically to
 * any logged-in user regardless of role.
 */
export interface CbnScheduleEntry {
  id: number;
  course_id: number;
  course_title: string;
  course_url?: string;
  episode?: string;
  lesson_id: number;
  lesson_title: string;
  lesson_url?: string;
  lesson_number?: string;
  thumb?: string;
  category: number | null;
  schedule_date: string;
  status: number;
  is_current: boolean;
}

/** Full response from GET /schedules */
export interface CbnSchedulesResponse {
  success: boolean;
  schedules: CbnScheduleEntry[];
}
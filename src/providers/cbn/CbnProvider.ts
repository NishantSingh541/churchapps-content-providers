import { ContentProviderConfig, ContentProviderAuthData, ContentItem, ContentFile, ProviderLogos, ProviderCapabilities, IProvider, AuthType, Instructions, DeviceAuthorizationResponse, DeviceFlowPollResult } from "../../interfaces";
import { parsePath } from "../../pathUtils";
import { ApiHelper, DeviceFlowHelper } from "../../helpers";
import { CbnCatalogCategory, CbnCatalogCourse, CbnCourseDetail, CbnLessonPlaylist, CbnTodayResponse } from "./CbnInterfaces";
import { convertCatalogToFolders, convertCoursesToFolders, convertLessonsToFolders, convertPlaylistToFiles, convertPlaylistToInstructions } from "./CbnConverters";
import { CBN_LOGO } from "./logo";
const API_BASE = "https://sbamemberdev.wpenginepowered.com/wp-json/superbook/v1";
/**
 * CBN Provider
 *
 * Faith-based kids' video curriculum. Auth uses OAuth 2.0 Device Flow.
 *
 * Path structure:
 *   /                                          -> single "Catalog" root folder
 *   /catalog                                   -> category folders (GET /catalogs)
 *   /catalog/{catalogId}                       -> course folders   (GET /courses/{catalogId})
 *   /catalog/{catalogId}/{courseId}            -> lesson folders   (GET /course-detail/{courseId})
 *   /catalog/{catalogId}/{courseId}/{lessonId} -> video files      (GET /lesson-playlist/{lessonId})
 */
export class CbnProvider implements IProvider {
  private readonly apiHelper = new ApiHelper();
  private readonly deviceFlowHelper = new DeviceFlowHelper();
  private async apiRequest<T>(path: string, auth?: ContentProviderAuthData | null): Promise<T | null> {
    return this.apiHelper.apiRequest<T>(this.config, this.id, path, auth);
  }
  readonly id = "cbn";
  readonly name = "CBN";
  readonly logos: ProviderLogos = { light: CBN_LOGO, dark: CBN_LOGO };
  readonly config: ContentProviderConfig = {
    id: "cbn",
    name: "CBN",
    apiBase: API_BASE,
    oauthBase: `${API_BASE}/auth`,
    clientId: "freeplay",
    scopes: [],
    supportsDeviceFlow: true,
    deviceAuthEndpoint: "/device",
    endpoints: {
      catalog: "/catalogs",
      courses: (catalogId: string) => `/courses/${catalogId}`,
      courseDetail: (courseId: string) => `/course-detail/${courseId}`,
      lessonPlaylist: (lessonId: string) => `/lesson-playlist/${lessonId}`,
      today: "/today"
    }
  };
  readonly requiresAuth = true;
  readonly authTypes: AuthType[] = ["device_flow"];
  readonly capabilities: ProviderCapabilities = { browse: true, playlist: true, instructions: true, mediaLicensing: false };
  async browse(path?: string | null, auth?: ContentProviderAuthData | null): Promise<ContentItem[]> {
    const { segments, depth } = parsePath(path);
    if (depth === 0) {
      return [{ type: "folder" as const, id: "catalog-root", title: "Catalog", path: "/catalog" }];
    }
    if (segments[0] !== "catalog") return [];
    if (depth === 1) return this.getCatalogs(auth);
    if (depth === 2) {
      const catalogId = segments[1];
      if (!catalogId) return [];
      return this.getCourses(catalogId, path!, auth);
    }
    if (depth === 3) {
      const courseId = segments[2];
      if (!courseId) return [];
      return this.getLessons(courseId, path!, auth);
    }
    if (depth === 4) {
      const lessonId = segments[3];
      if (!lessonId) return [];
      return this.getVideos(lessonId, auth);
    }
    return [];
  }
  private async getCatalogs(auth?: ContentProviderAuthData | null): Promise<ContentItem[]> {
    const response = await this.apiRequest<CbnCatalogCategory[]>(this.config.endpoints!.catalog as string, auth);
    if (!Array.isArray(response)) return [];
    return convertCatalogToFolders(response);
  }
  private async getCourses(catalogId: string, coursePath: string, auth?: ContentProviderAuthData | null): Promise<ContentItem[]> {
    const pathFn = this.config.endpoints!.courses as (id: string) => string;
    const response = await this.apiRequest<CbnCatalogCourse[]>(pathFn(catalogId), auth);
    if (!Array.isArray(response)) return [];
    return convertCoursesToFolders(response, coursePath);
  }
  private async getLessons(courseId: string, coursePath: string, auth?: ContentProviderAuthData | null): Promise<ContentItem[]> {
    const pathFn = this.config.endpoints!.courseDetail as (id: string) => string;
    const response = await this.apiRequest<CbnCourseDetail>(pathFn(courseId), auth);
    if (!response?.lessons) return [];
    return convertLessonsToFolders(response.lessons, coursePath);
  }
  private async getVideos(lessonId: string, auth?: ContentProviderAuthData | null): Promise<ContentItem[]> {
    const playlist = await this.fetchPlaylist(lessonId, auth);
    return playlist ? convertPlaylistToFiles(playlist) : [];
  }
  private async fetchPlaylist(lessonId: string, auth?: ContentProviderAuthData | null): Promise<CbnLessonPlaylist | null> {
    const pathFn = this.config.endpoints!.lessonPlaylist as (id: string) => string;
    return this.apiRequest<CbnLessonPlaylist>(pathFn(lessonId), auth);
  }
  /**
   * Extract the lesson ID from a playlist/instructions path.
   *
   * Tolerates both shapes:
   *   /catalog/{catalogId}/{courseId}/{lessonId}          (this provider's paths)
   *   /cbn/catalog/{catalogId}/{courseId}/{lessonId}      (provider-prefixed)
   * The lesson ID is always the LAST segment, and "catalog" must appear
   * as either the first or second segment.
   */
  private lessonIdFromPath(path: string): string | null {
    const { segments, depth } = parsePath(path);
    if (depth < 4) return null;
    if (segments[0] !== "catalog" && segments[1] !== "catalog") return null;
    const lessonId = segments[segments.length - 1];
    return lessonId ?? null;
  }
  async getPlaylist(path: string, auth?: ContentProviderAuthData | null, _resolution?: number): Promise<ContentFile[] | null> {
    const lessonId = this.lessonIdFromPath(path);
    if (!lessonId) return null;
    const playlist = await this.fetchPlaylist(lessonId, auth);
    if (!playlist || playlist.playlist.length === 0) return null;
    return convertPlaylistToFiles(playlist);
  }
  async getInstructions(path: string, auth?: ContentProviderAuthData | null): Promise<Instructions | null> {
    const lessonId = this.lessonIdFromPath(path);
    if (!lessonId) return null;
    const playlist = await this.fetchPlaylist(lessonId, auth);
    if (!playlist || playlist.playlist.length === 0) return null;
    return convertPlaylistToInstructions(playlist);
  }
  /**
   * Resolve today's scheduled lesson for a specific school type.
   * category: 1 = Pre-School, 2 = Primary School.
   *
   * Returns null if nothing is scheduled for that school type (caller
   * should show an empty state and keep the school-type switcher visible).
   */
  async getTodayLesson(
    category: number,
    auth?: ContentProviderAuthData | null
  ): Promise<{
    courseId: number;
    courseTitle: string;
    lessonId: number;
    lessonTitle: string;
    scheduledDate: string;
    category: number | null;
    files: ContentFile[];
    instructions: Instructions;
  } | null> {
    const basePath = this.config.endpoints!.today as string;
    const response = await this.apiRequest<CbnTodayResponse>(`${basePath}?category=${category}`, auth);
    if (!response?.success || !response.schedule) return null;
    const { schedule } = response;
    if (!schedule.playlist || schedule.playlist.playlist.length === 0) return null;
    return {
      courseId: schedule.course.id,
      courseTitle: schedule.course.title,
      lessonId: schedule.lesson.id,
      lessonTitle: schedule.lesson.title,
      scheduledDate: schedule.date,
      category: schedule.category ?? null,
      files: convertPlaylistToFiles(schedule.playlist),
      instructions: convertPlaylistToInstructions(schedule.playlist)
    };
  }
  supportsDeviceFlow(): boolean {
    return this.deviceFlowHelper.supportsDeviceFlow(this.config);
  }
  async initiateDeviceFlow(): Promise<DeviceAuthorizationResponse | null> {
    return this.deviceFlowHelper.initiateDeviceFlow(this.config);
  }
  async pollDeviceFlowToken(deviceCode: string): Promise<DeviceFlowPollResult> {
    return this.deviceFlowHelper.pollDeviceFlowToken(this.config, deviceCode);
  }
}
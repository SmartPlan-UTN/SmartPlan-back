/**
 * `GET /sessions/me` response: the calling session's own metadata, per
 * `user_session` (`ip`, `started_at`). No device or location fields exist
 * on the entity — there is no user-agent/geolocation tracking — so this
 * intentionally carries only what SmartPlan-back actually records, not the
 * v2 system design's mocked "iPhone 16 Pro · Buenos Aires" device string.
 */
export interface CurrentSessionResponseDto {
  ip: string | null;
  startedAt: string;
}

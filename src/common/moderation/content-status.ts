/**
 * Where a piece of user content stands under report-based moderation
 * (SmartPlan-front#156): a rating, a shared experience comment or a shared
 * experience photo. Everything is published the moment it is created; a
 * report hides it until an administrator keeps it or removes it.
 *
 * This file is the single source of truth for which statuses the public
 * sees and how a status moves: services, raw SQL and access checks all ask
 * it instead of spelling the rule out again.
 */
export enum ContentStatus {
  Published = 'published',
  UnderReview = 'under_review',
  Kept = 'kept',
  Removed = 'removed',
}

/** The single PostgreSQL enum type every moderated column shares. */
export const CONTENT_STATUS_ENUM = 'content_status';

/** What an administrator decides about reported content. */
export enum ContentDecision {
  Keep = 'keep',
  Remove = 'remove',
}

/** The statuses everyone may see. */
export const PUBLIC_CONTENT_STATUSES: readonly ContentStatus[] = [
  ContentStatus.Published,
  ContentStatus.Kept,
];

export function isPubliclyVisible(status: ContentStatus): boolean {
  return PUBLIC_CONTENT_STATUSES.includes(status);
}

/**
 * Whether a viewer sees the content where the community sees it. Its author
 * keeps seeing it while it is under review, exactly as before, with no trace
 * of the report; removed content is out of the community for everyone.
 */
export function canViewContent(
  status: ContentStatus,
  viewer: { isAuthor: boolean },
): boolean {
  return (
    isPubliclyVisible(status) ||
    (viewer.isAuthor && status === ContentStatus.UnderReview)
  );
}

/**
 * The SQL predicate "`column` is publicly visible", for raw SQL and query
 * builders alike. `column` is a trusted, code-defined column reference.
 */
export function publicContentSql(column: string): string {
  return `${column} IN (${PUBLIC_CONTENT_STATUSES.map((status) => `'${status}'`).join(', ')})`;
}

/**
 * The SQL counterpart of `canViewContent` for a non-admin viewer: public, or
 * under review and written by the viewer bound as `:viewerId` (`null` for an
 * anonymous viewer, who then sees only public content).
 */
export function viewableContentSql(
  statusColumn: string,
  authorColumn: string,
): string {
  return `(${publicContentSql(statusColumn)} OR (${authorColumn} = :viewerId AND ${statusColumn} = '${ContentStatus.UnderReview}'))`;
}

/**
 * A new report hides published content at once. Content an administrator
 * already kept stays visible: the report is only queued for review, so a
 * single user cannot hide it again and again.
 */
export function statusAfterReport(status: ContentStatus): ContentStatus {
  return status === ContentStatus.Published
    ? ContentStatus.UnderReview
    : status;
}

export function statusAfterDecision(decision: ContentDecision): ContentStatus {
  return decision === ContentDecision.Remove
    ? ContentStatus.Removed
    : ContentStatus.Kept;
}

/**
 * Whether content with open reports can still receive a decision. An edit
 * can reset kept content to published without closing its reports; removal
 * remains final. The caller must verify that open reports exist first.
 */
export function canDecide(status: ContentStatus): boolean {
  return status !== ContentStatus.Removed;
}

/**
 * Editing the text invalidates an administrator's earlier "keep", so it can
 * be hidden by a report again. Editing never lifts a review or a removal.
 */
export function statusAfterEdit(status: ContentStatus): ContentStatus {
  return status === ContentStatus.Kept ? ContentStatus.Published : status;
}

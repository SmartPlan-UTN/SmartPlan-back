/**
 * Where a piece of shared community content (#106) stands. Content is
 * published the moment it is shared, so `unreviewed` is already public: an
 * administrator later confirms it (`approved`) or takes it down (`rejected`).
 * Only `rejected` ever reaches the author, never the other two.
 */
export enum CommunityContentStatus {
  Unreviewed = 'unreviewed',
  Approved = 'approved',
  Rejected = 'rejected',
}

/** The single PostgreSQL enum type both moderated columns share. */
export const COMMUNITY_CONTENT_STATUS_ENUM = 'community_content_status';

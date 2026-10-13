import {
  canDecide,
  canViewContent,
  ContentDecision,
  ContentStatus,
  isPubliclyVisible,
  publicContentSql,
  statusAfterDecision,
  statusAfterEdit,
  statusAfterReport,
  viewableContentSql,
} from './content-status';

describe('content status (#156)', () => {
  it('shows published and kept content to everyone', () => {
    expect(isPubliclyVisible(ContentStatus.Published)).toBe(true);
    expect(isPubliclyVisible(ContentStatus.Kept)).toBe(true);
    expect(isPubliclyVisible(ContentStatus.UnderReview)).toBe(false);
    expect(isPubliclyVisible(ContentStatus.Removed)).toBe(false);
  });

  it('keeps content under review visible to its author only', () => {
    const status = ContentStatus.UnderReview;
    expect(canViewContent(status, { isAuthor: true })).toBe(true);
    expect(canViewContent(status, { isAuthor: false })).toBe(false);
  });

  it('takes removed content out of the community for its author too', () => {
    expect(canViewContent(ContentStatus.Removed, { isAuthor: true })).toBe(
      false,
    );
  });

  it('spells the same rule out in SQL', () => {
    expect(publicContentSql('"rating"."status"')).toBe(
      `"rating"."status" IN ('published', 'kept')`,
    );
    expect(viewableContentSql('image.status', 'outing.idUser')).toBe(
      `(image.status IN ('published', 'kept') OR (outing.idUser = :viewerId AND image.status = 'under_review'))`,
    );
  });

  it('hides published content at the first report', () => {
    expect(statusAfterReport(ContentStatus.Published)).toBe(
      ContentStatus.UnderReview,
    );
    expect(statusAfterReport(ContentStatus.UnderReview)).toBe(
      ContentStatus.UnderReview,
    );
  });

  it('does not hide again content an administrator kept', () => {
    expect(statusAfterReport(ContentStatus.Kept)).toBe(ContentStatus.Kept);
  });

  it('keeps or removes reported content', () => {
    expect(statusAfterDecision(ContentDecision.Keep)).toBe(ContentStatus.Kept);
    expect(statusAfterDecision(ContentDecision.Remove)).toBe(
      ContentStatus.Removed,
    );
    expect(canDecide(ContentStatus.UnderReview)).toBe(true);
    expect(canDecide(ContentStatus.Kept)).toBe(true);
    expect(canDecide(ContentStatus.Published)).toBe(false);
    expect(canDecide(ContentStatus.Removed)).toBe(false);
  });

  it('lets an edit undo a keep, but never a review or a removal', () => {
    expect(statusAfterEdit(ContentStatus.Kept)).toBe(ContentStatus.Published);
    expect(statusAfterEdit(ContentStatus.UnderReview)).toBe(
      ContentStatus.UnderReview,
    );
    expect(statusAfterEdit(ContentStatus.Removed)).toBe(ContentStatus.Removed);
    expect(statusAfterEdit(ContentStatus.Published)).toBe(
      ContentStatus.Published,
    );
  });
});

export interface MediaImageDto {
  id: number;
  url: string;
  isPrimary: boolean;
  displayOrder: number;
  createdAt: Date;
  /**
   * Present (`true`) only for an outing photo's owner or an administrator,
   * when moderation took it down from the community (#106).
   */
  communityHidden?: true;
}
export interface AvatarDto {
  id: number;
  url: string;
  createdAt: Date;
}

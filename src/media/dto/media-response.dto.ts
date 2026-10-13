export interface MediaImageDto {
  id: number;
  url: string;
  isPrimary: boolean;
  displayOrder: number;
  createdAt: Date;
  /**
   * Present (`true`) only for an outing photo's owner or an administrator,
   * when an administrator removed it after a report (#156). A photo under
   * review shows no trace of it.
   */
  communityHidden?: true;
}
export interface AvatarDto {
  id: number;
  url: string;
  createdAt: Date;
}

export interface PlacePhotoAuthorDto {
  displayName: string;
  uri: string | null;
}

export interface PlacePhotoDto {
  /** `places/{placeId}/photos/{reference}`: short-lived, never stored. */
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  authors: PlacePhotoAuthorDto[];
}

export interface PlacePhotoMediaDto {
  body: Buffer;
  contentType: string;
}

export interface PlaceResponseDto {
  images?: import('../../media/dto/media-response.dto').MediaImageDto[];
  id: number;
  name: string;
  description: string | null;
  address: string;
  department: {
    id: number;
    name: string;
    city: {
      id: number;
      name: string;
      country: { id: number; name: string };
    };
  };
}

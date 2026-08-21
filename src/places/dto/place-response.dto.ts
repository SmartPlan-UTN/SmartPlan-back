export interface PlaceResponseDto {
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

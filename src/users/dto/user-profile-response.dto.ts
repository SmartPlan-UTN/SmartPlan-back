export interface UserProfileResponseDto {
  id: number;
  name: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: { key: string; name: string };
  status: { key: string; name: string };
}

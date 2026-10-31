export interface UserProfileResponseDto {
  id: number;
  name: string;
  lastName: string;
  username: string | null;
  bio: string | null;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  /** Reminder emails opt-in (#127); `true` unless the person turned them off. */
  emailRemindersEnabled: boolean;
  role: { key: string; name: string };
  status: { key: string; name: string };
}

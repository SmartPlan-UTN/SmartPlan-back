export interface SessionUserDto {
  id: number;
  name: string;
  lastName: string;
  email: string;
  role: { key: string; name: string };
  permissions: string[];
}

export interface AuthenticationResponseDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: SessionUserDto;
}

export interface AuthenticationResult {
  response: AuthenticationResponseDto;
  refreshToken: string;
}

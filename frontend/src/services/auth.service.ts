import api from './api';
import type { User } from '../types';

interface AuthResponse {
  success: boolean;
  data: { accessToken: string; user: User };
}

export const authService = {
  register: (data: { name: string; email: string; password: string; preferredLanguage?: string; proficiencyLevel?: string }) =>
    api.post<AuthResponse>('/auth/register', data),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  logout: () => api.post('/auth/logout'),

  refreshToken: () => api.post<{ success: boolean; data: { accessToken: string } }>('/auth/refresh-token'),

  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),

  resetPassword: (email: string, token: string, newPassword: string) =>
    api.post('/auth/reset-password', { email, token, newPassword }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/change-password', { currentPassword, newPassword }),
};

export const userService = {
  getProfile: () => api.get<{ success: boolean; data: User }>('/user/profile'),
  updateProfile: (data: Partial<User>) => api.put('/user/profile', data),
  updatePreferences: (data: Partial<Pick<User, 'theme' | 'readingPreferences' | 'vocabularySettings'>>) =>
    api.put('/user/preferences', data),
};

import { z } from 'zod'

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().optional(),
})

export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})

export const LogoutBodySchema = z.object({
  refreshToken: z.string().min(1),
})

export type LoginBody = z.infer<typeof LoginBodySchema>
export type RefreshBody = z.infer<typeof RefreshBodySchema>
export type LogoutBody = z.infer<typeof LogoutBodySchema>

export interface AuthUserResponse {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  tenantId: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUserResponse
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

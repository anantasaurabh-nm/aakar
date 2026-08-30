import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { LoginRequestSchema, type LoginResponse, type SessionUser } from '@erp/shared-contracts';
import { JwtAuthGuard, AUTH_COOKIE_NAME } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';

const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: { identifier: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const user = await this.authService.validateCredentials(body.identifier, body.password);
    const token = await this.authService.issueToken(user);

    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });

    const sessionUser = await this.authService.toSessionUser(user);
    return { user: sessionUser };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{ user: SessionUser }> {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const sessionUser = await this.authService.toSessionUser(record);
    return { user: sessionUser };
  }
}

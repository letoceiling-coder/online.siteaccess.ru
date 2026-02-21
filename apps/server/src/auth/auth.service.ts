import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    try {
      // Enforce strict lowercase email policy
      const emailNormalized = dto.email.trim().toLowerCase();

      const existingUser = await this.prisma.user.findUnique({
        where: { email: emailNormalized },
      });

      if (existingUser) {
        throw new ConflictException('User already exists');
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);

      const user = await this.prisma.user.create({
        data: {
          email: emailNormalized, // Store lowercase only
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      });

      return user;
    } catch (error) {
      // Log error details (never log passwords)
      this.logger.error(`Registration failed for email: ${dto.email}`, error.stack || error.message);
      
      // Handle Prisma errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // Unique constraint violation (email exists)
          throw new ConflictException('User already exists');
        }
        // Database permission errors
        if (error.code === 'P2003' || error.message?.includes('permission denied')) {
          this.logger.error('Database permission error', error);
          throw new HttpException('Database access error', 500);
        }
      }
      
      // Re-throw HttpException as-is
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Unknown errors
      this.logger.error('Unexpected registration error', error);
      throw new BadRequestException('Registration failed');
    }
  }

  async login(dto: LoginDto) {
    try {
      // Enforce strict lowercase email policy
      const emailNormalized = dto.email.trim().toLowerCase();

      // Strict lowercase lookup (no fallback)
      const user = await this.prisma.user.findUnique({
        where: { email: emailNormalized },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const isValid = await bcrypt.compare(dto.password, user.passwordHash);

      if (!isValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const payload = { sub: user.id, email: user.email };
      const accessToken = this.jwtService.sign(payload, {
        secret: process.env.USER_JWT_SECRET || process.env.JWT_SECRET,
      });

      return {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
        },
      };
    } catch (error) {
      // Log error details (never log passwords)
      this.logger.error(`Login failed for email: ${dto.email}`, error.stack || error.message);
      
      // Handle Prisma errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.message?.includes('permission denied')) {
          this.logger.error('Database permission error', error);
          throw new HttpException('Database access error', 500);
        }
      }
      
      // Re-throw HttpException as-is
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Unknown errors
      this.logger.error('Unexpected login error', error);
      throw new UnauthorizedException('Login failed');
    }
  }
}

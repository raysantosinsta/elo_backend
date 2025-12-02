/* eslint-disable prettier/prettier */
// /* eslint-disable prettier/prettier */
// /* eslint-disable @typescript-eslint/require-await */
// /* eslint-disable @typescript-eslint/no-unsafe-return */
// /* eslint-disable @typescript-eslint/no-unsafe-member-access */
// /* eslint-disable @typescript-eslint/no-unsafe-assignment */
// // auth/refresh-token.strategy.ts
// import { Strategy, ExtractJwt, StrategyOptionsWithRequest } from 'passport-jwt';
// import { PassportStrategy } from '@nestjs/passport';
// import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { Request } from 'express';
// import { UserRole } from '@prisma/client';

// interface RefreshTokenPayload {
//   sub: string;
//   email: string;
//   role: UserRole;
//   companyId: string | null;
//   iat?: number;
//   exp?: number;
// }

// interface ValidatedUser {
//   userId: string;
//   email: string;
//   role: UserRole;
//   companyId: string | null;
//   refreshToken: string;
// }

// @Injectable()
// export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
//   private readonly logger = new Logger(RefreshTokenStrategy.name);

//   constructor(configService: ConfigService) {
//     const secret = configService.get<string>('JWT_REFRESH_SECRET');
    
//     if (!secret) {
//       throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
//     }

//     const options: StrategyOptionsWithRequest = {
//       jwtFromRequest: ExtractJwt.fromExtractors([
//         (request: Request) => {
//           // Tenta extrair do cookie
//           const token = request?.cookies?.refresh_token || 
//                        this.extractTokenFromHeader(request);
          
//           if (process.env.NODE_ENV !== 'production') {
//             this.logger.debug(`🔄 [REFRESH STRATEGY] Token extraído: ${token ? 'Present' : 'Null'}`);
//           }
          
//           return token;
//         },
//       ]),
//       secretOrKey: secret,
//       passReqToCallback: true,
//       ignoreExpiration: false,
//       algorithms: ['HS256'],
//     };
    
//     super(options);
//   }

//   private extractTokenFromHeader(request: Request): string | null {
//     const authHeader = request.headers.authorization;
//     if (!authHeader) {
//       return null;
//     }
    
//     if (authHeader.startsWith('Bearer ')) {
//       return authHeader.substring(7);
//     }
    
//     return authHeader;
//   }

//   async validate(req: Request, payload: RefreshTokenPayload): Promise<ValidatedUser> {
//     try {
//       if (process.env.NODE_ENV !== 'production') {
//         this.logger.debug(`🔄 [REFRESH STRATEGY] Payload recebido:`, {
//           sub: payload.sub,
//           email: payload.email,
//           role: payload.role,
//         });
//       }

//       // Valida o payload básico
//       if (!payload.sub || !payload.email || !payload.role) {
//         this.logger.warn('❌ [REFRESH STRATEGY] Payload de refresh incompleto');
//         throw new UnauthorizedException('Refresh token inválido: payload incompleto');
//       }

//       // Verifica se o token está expirado
//       if (payload.exp && Date.now() >= payload.exp * 1000) {
//         this.logger.warn('❌ [REFRESH STRATEGY] Refresh token expirado');
//         throw new UnauthorizedException('Refresh token expirado');
//       }

//       // Extrai o token do header ou cookie
//       let refreshToken = req?.cookies?.refresh_token || null;
      
//       if (!refreshToken) {
//         const authHeader = req.headers.authorization;
//         if (authHeader) {
//           refreshToken = authHeader.startsWith('Bearer ') 
//             ? authHeader.substring(7) 
//             : authHeader;
//         }
//       }
      
//       if (!refreshToken) {
//         this.logger.warn('❌ [REFRESH STRATEGY] Refresh token não encontrado');
//         throw new UnauthorizedException('Refresh token não encontrado');
//       }

//       if (process.env.NODE_ENV !== 'production') {
//         this.logger.debug(`✅ [REFRESH STRATEGY] Refresh token validado para usuário: ${payload.email}`);
//       }

//       return {
//         userId: payload.sub,
//         email: payload.email,
//         role: payload.role,
//         companyId: payload.companyId,
//         refreshToken,
//       };
//     } catch (error) {
//       this.logger.error(`💥 [REFRESH STRATEGY] Erro ao validar refresh token: ${error.message}`);
      
//       if (error instanceof UnauthorizedException) {
//         throw error;
//       }
      
//       throw new UnauthorizedException('Falha na validação do refresh token');
//     }
//   }
// }
import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        // Se não há URL do Redis configurada, usa cache em memória
        if (!redisUrl) {
          console.log('⚠️  REDIS_URL não configurada. Usando cache em memória.');
          return {
            ttl: 60 * 1000, // 60 segundos em ms
            max: 100, // máximo de itens em cache
          };
        }

        try {
          const store = await redisStore({
            url: redisUrl,
            ttl: 60 * 1000, // 60 segundos padrão
          });

          console.log('✅ Redis conectado com sucesso');

          return {
            store,
            ttl: 60 * 1000,
          };
        } catch (error) {
          console.error('❌ Erro ao conectar ao Redis:', error);
          console.log('⚠️  Usando cache em memória como fallback.');
          return {
            ttl: 60 * 1000,
            max: 100,
          };
        }
      },
    }),
  ],
  providers: [RedisService],
  exports: [CacheModule, RedisService],
})
export class RedisModule {}

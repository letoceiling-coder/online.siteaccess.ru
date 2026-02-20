import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation
  app.useGlobalPipes(new ValidationPipe());

          // Enable CORS
          app.enableCors({
            origin: true,
            credentials: true,
          });

          // SPA fallback for portal (after all static routes)
          app.use((req, res, next) => {
            if (
              !req.path.startsWith('/api') &&
              !req.path.startsWith('/widget') &&
              !req.path.startsWith('/operator') &&
              !req.path.startsWith('/demo')
            ) {
              // Let ServeStaticModule handle it
            }
            next();
          });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();

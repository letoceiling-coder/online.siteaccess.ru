import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable validation
  app.useGlobalPipes(new ValidationPipe());

  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // SPA fallback for portal (after all routes)
  // This must be after all other routes are registered
  // __dirname is dist/, so we need to go up to apps/server, then to apps/portal
  const portalDistPath = join(__dirname, '..', '..', '..', 'portal', 'dist');
  
  // Serve static assets from portal
  app.useStaticAssets(portalDistPath, {
    prefix: '/',
    index: false,
  });

  // SPA fallback: serve index.html for routes that don't match /api, /widget, /operator, /demo
  app.use((req, res, next) => {
    if (
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/widget') &&
      !req.path.startsWith('/operator') &&
      !req.path.startsWith('/demo') &&
      !req.path.startsWith('/health')
    ) {
      res.sendFile(join(portalDistPath, 'index.html'));
    } else {
      next();
    }
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();

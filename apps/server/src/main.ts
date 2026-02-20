import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Body size limit (1MB)
  app.use(require('express').json({ limit: '1mb' }));
  app.use(require('express').urlencoded({ limit: '1mb', extended: true }));

  // Enable validation
  app.useGlobalPipes(new ValidationPipe());

  // Enable CORS - strict for /api/widget/*, permissive for others
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests without origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      // For /api/widget/* routes, check will be done in controller
      // For other routes, allow all origins
      callback(null, true);
    },
    credentials: true,
  });

  // SPA fallback for portal (after all routes)
  // This must be after all other routes are registered
  // __dirname in compiled code is dist/, so:
  // dist/ -> ../ -> apps/server/ -> ../ -> apps/ -> portal/dist
  const portalDistPath = join(__dirname, '..', '..', 'portal', 'dist');
  
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

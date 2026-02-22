import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Global exception filter for logging all errors
  app.useGlobalFilters(new AllExceptionsFilter());

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

  // Static file serving order (must be before SPA fallback):
  // 1. /widget/v1/* -> widget dist
  // 2. /operator/* -> operator dist
  // 3. /demo/* -> demo files
  // 4. /sounds/* -> operator-web sounds
  // 5. Portal static assets (CSS, JS, images) -> portal dist
  // 6. SPA fallback -> portal index.html (only for non-API, non-static paths)

  const expressApp = app.getHttpAdapter().getInstance();
  const express = require('express');

  // Portal dist path
  // __dirname in compiled code is dist/, so:
  // dist/ -> ../ -> apps/server/ -> ../ -> apps/ -> portal/dist
  const portalDistPath = join(__dirname, '..', '..', 'portal', 'dist');
  
  // 1. Widget dist at /widget/v1
  const widgetDistPath = join(__dirname, '..', '..', 'widget', 'dist');
  expressApp.use('/widget/v1', express.static(widgetDistPath, { index: false }));
  
  // 2. Operator dist at /operator (with index.html fallback)
  const operatorDistPath = join(__dirname, '..', '..', 'operator-web', 'dist');
  expressApp.use('/operator', express.static(operatorDistPath, { index: false }));
  
  // 3. Demo files at /demo
  const demoPath = join(__dirname, '..', '..', 'widget', 'demo');
  expressApp.use('/demo', express.static(demoPath, { index: false }));
  
  // 4. Serve sounds directory BEFORE portal static (to avoid SPA fallback)
  const soundsPath = join(__dirname, '..', '..', 'operator-web', 'public', 'sounds');
  app.useStaticAssets(soundsPath, {
    prefix: '/sounds',
    index: false,
  });
  
  // 5. Serve portal static assets (CSS, JS, images) at root
  // This must NOT serve index.html automatically
  app.useStaticAssets(portalDistPath, {
    prefix: '/',
    index: false,
  });

  // 6. SPA fallback: serve portal index.html ONLY for GET requests
  // that don't match /api, /widget, /operator, /demo, /health, /sounds
  // and are not already handled by static files
  // Also serve operator index.html for /operator/* routes that don't match static files
  expressApp.get('/operator/*', (req: any, res: any, next: any) => {
    // Serve operator index.html for SPA routes under /operator
    res.sendFile(join(operatorDistPath, 'index.html'), (err: any) => {
      if (err) {
        next(err);
      }
    });
  });
  
  // SPA fallback for all other routes
  expressApp.get('*', (req: any, res: any, next: any) => {
    const requestPath = req.path;
    
    // Skip if already handled by static files or API
    if (
      requestPath.startsWith('/api') ||
      requestPath.startsWith('/widget') ||
      requestPath.startsWith('/operator') ||
      requestPath.startsWith('/demo') ||
      requestPath.startsWith('/health') ||
      requestPath.startsWith('/sounds')
    ) {
      return next();
    }
    
    // Serve portal index.html for SPA routes
    res.sendFile(join(portalDistPath, 'index.html'), (err: any) => {
      if (err) {
        next(err);
      }
    });
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

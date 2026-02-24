import { Controller, Get } from '@nestjs/common';
import { createHmac } from 'crypto';

@Controller('api/turn-credentials')
export class TurnController {
  @Get()
  getTurnCredentials() {
    const turnSecret = process.env.TURN_SECRET;
    
    if (!turnSecret) {
      throw new Error('TURN_SECRET not configured');
    }

    // Generate username: expiry timestamp (10 minutes from now)
    const expiry = Math.floor(Date.now() / 1000) + 600; // 10 minutes
    const username = expiry.toString();

    // Generate password: HMAC-SHA1(username, TURN_SECRET)
    const password = createHmac('sha1', turnSecret)
      .update(username)
      .digest('base64');

    return {
      username,
      credential: password,
      ttl: 600, // 10 minutes in seconds
    };
  }
}

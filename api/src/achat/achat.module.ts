import { Module } from '@nestjs/common';
import { AchatController } from './achat.controller';

@Module({
  controllers: [AchatController],
})
export class AchatModule {}

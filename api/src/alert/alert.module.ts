import { Module } from '@nestjs/common';
import { GraphModule } from 'src/graph/graph.module';
import { WsModule } from 'src/ws/ws.module';
import { AlertDetectionService } from './alert-detection.service';
import { AlertController } from './alert.controller';

@Module({
  imports: [GraphModule, WsModule],
  controllers: [AlertController],
  providers: [AlertDetectionService],
  exports: [AlertDetectionService],
})
export class AlertModule {}

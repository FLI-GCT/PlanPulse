import { Module } from '@nestjs/common';
import { GraphModule } from 'src/graph/graph.module';
import { WsGateway } from './ws.gateway';

@Module({
  imports: [GraphModule],
  providers: [WsGateway],
  exports: [WsGateway],
})
export class WsModule {}

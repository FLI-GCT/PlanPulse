import { Module } from '@nestjs/common';
import { GraphModule } from 'src/graph/graph.module';
import { WsModule } from 'src/ws/ws.module';
import { ScenarioController } from './scenario.controller';
import { ScenarioService } from './scenario.service';

@Module({
  imports: [GraphModule, WsModule],
  controllers: [ScenarioController],
  providers: [ScenarioService],
  exports: [ScenarioService],
})
export class ScenarioModule {}

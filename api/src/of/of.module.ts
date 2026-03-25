import { Module } from '@nestjs/common';
import { GraphModule } from 'src/graph/graph.module';
import { OfController } from './of.controller';

@Module({
  imports: [GraphModule],
  controllers: [OfController],
})
export class OfModule {}

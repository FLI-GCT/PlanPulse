import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GraphService } from './services/graph.service';
import { PropagationService } from './services/propagation.service';
import { CriticalPathService } from './services/critical-path.service';
import { AllocationService } from './services/allocation.service';
import { FeasibilityService } from './services/feasibility.service';

@Module({
  controllers: [GraphController],
  providers: [
    GraphService,
    PropagationService,
    CriticalPathService,
    AllocationService,
    FeasibilityService,
  ],
  exports: [
    GraphService,
    PropagationService,
    CriticalPathService,
    AllocationService,
    FeasibilityService,
  ],
})
export class GraphModule {}

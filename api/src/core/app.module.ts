import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from 'src/_shared/adapters/prisma/prisma.module';
import { AchatModule } from 'src/achat/achat.module';
import { AlertModule } from 'src/alert/alert.module';
import { GraphModule } from 'src/graph/graph.module';
import { KpiModule } from 'src/kpi/kpi.module';
import { NomenclatureModule } from 'src/nomenclature/nomenclature.module';
import { OfModule } from 'src/of/of.module';
import { ScenarioModule } from 'src/scenario/scenario.module';
import { WsModule } from 'src/ws/ws.module';
import { CommonModule } from './common.module';
import { envVariables } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envVariables],
      envFilePath: ['../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    GraphModule,
    OfModule,
    AchatModule,
    AlertModule,
    NomenclatureModule,
    KpiModule,
    WsModule,
    ScenarioModule,
  ],
})
export class AppModule {}

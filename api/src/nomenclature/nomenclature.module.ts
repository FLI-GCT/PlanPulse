import { Module } from '@nestjs/common';
import { NomenclatureController } from './nomenclature.controller';

@Module({
  controllers: [NomenclatureController],
})
export class NomenclatureModule {}

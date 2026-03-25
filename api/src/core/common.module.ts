import { Module } from '@nestjs/common';
import { DateTime } from 'src/_shared/adapters/datetime';
import { IdGenerator } from 'src/_shared/adapters/id-generator';
import { I_DATE_TIME, I_ID_GENERATOR } from 'src/_shared/ports';

@Module({
  providers: [
    {
      provide: I_ID_GENERATOR,
      useClass: IdGenerator,
    },
    {
      provide: I_DATE_TIME,
      useClass: DateTime,
    },
  ],
  exports: [I_ID_GENERATOR, I_DATE_TIME],
})
export class CommonModule {}

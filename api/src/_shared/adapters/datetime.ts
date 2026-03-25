import { IDateTime } from '../ports';

export class DateTime implements IDateTime {
  nowUTC(): Date {
    return new Date();
  }
}

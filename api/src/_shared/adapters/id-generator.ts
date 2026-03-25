import { v7 as uuidv7 } from 'uuid';
import { IIdGenerator } from '../ports';

export class IdGenerator implements IIdGenerator {
  generate(): string {
    return uuidv7();
  }
}

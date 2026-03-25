import { DomainException } from 'src/_shared/exception';

export class OfNotFoundException extends DomainException {
  constructor(id: string) {
    super(`Ordre de fabrication '${id}' introuvable`);
  }
}

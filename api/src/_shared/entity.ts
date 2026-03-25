export abstract class Entity<T> {
  public initialState: T;
  public props: T;

  constructor(data: T) {
    this.initialState = { ...data };
    this.props = { ...data };
  }

  update(data: Partial<T>): void {
    this.props = { ...this.props, ...data };
  }

  commit(): void {
    this.initialState = { ...this.props };
  }

  clone(): Entity<T> {
    return new (this.constructor as new (props: T) => Entity<T>)(this.props);
  }
}

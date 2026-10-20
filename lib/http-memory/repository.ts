/** #44 storage seam. Later adapters may implement this interface without changing HTTP authority rules. */
export interface IdentityGroupRepository<State> { read(): State; reset(): void; }

export class ProcessMemoryRepository<State> implements IdentityGroupRepository<State> {
  private value: State;
  constructor(private readonly create: () => State) { this.value = create(); }
  read() { return this.value; }
  reset() { this.value = this.create(); }
}

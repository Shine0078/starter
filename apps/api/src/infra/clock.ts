import type { ClockPort } from '../ports';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }

  today(): string {
    return this.now().toISOString().slice(0, 10);
  }
}

/** Test double. Time-dependent assertions must not depend on when they run. */
export class FixedClock implements ClockPort {
  constructor(private readonly date: string) {}

  now(): Date {
    return new Date(`${this.date}T12:00:00.000Z`);
  }

  today(): string {
    return this.date;
  }
}

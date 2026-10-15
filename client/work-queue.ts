/** Read-only work queue. Releasing a queued consumer never cancels an agent. */
export class WorkQueue<T> {
  private active = 0;
  private jobs = new Map<string, { users: number; started: boolean; run: () => Promise<T>; promise: Promise<T | undefined>; resolve: (value: T | undefined) => void; reject: (error: unknown) => void }>();
  constructor(private readonly concurrency = 2) {}

  acquire(key: string, run: () => Promise<T>) {
    let job = this.jobs.get(key);
    if (!job) {
      let resolve!: (value: T | undefined) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<T | undefined>((yes, no) => { resolve = yes; reject = no; });
      job = { users: 0, started: false, run, promise, resolve, reject };
      this.jobs.set(key, job);
    }
    const current = job;
    current.users++;
    this.drain();
    let released = false;
    return { promise: current.promise, release: () => {
      if (released) return;
      released = true;
      current.users--;
      if (!current.started && current.users === 0) {
        if (this.jobs.get(key) === current) this.jobs.delete(key);
        current.resolve(undefined);
      }
    } };
  }

  private drain() {
    for (const [key, job] of this.jobs) {
      if (this.active >= this.concurrency) break;
      if (job.started) continue;
      job.started = true;
      this.active++;
      void Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => {
        this.active--;
        if (this.jobs.get(key) === job) this.jobs.delete(key);
        this.drain();
      });
    }
  }
}

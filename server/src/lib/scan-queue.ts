import { scanAndStore } from '../scanner/orchestrator.js';

interface ScanJob {
  domain: string;
  url: string;
}

class ScanQueue {
  private queue: ScanJob[] = [];
  private running = 0;
  private readonly concurrency = 3;

  enqueue(jobs: ScanJob[]): void {
    this.queue.push(...jobs);
    this.tick();
  }

  get size(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.running;
  }

  private tick(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.running++;
      scanAndStore(job.domain, job.url)
        .catch(err => {
          console.error(`[scan-queue] scanAndStore failed for ${job.domain}:`, err?.message ?? err);
        })
        .finally(() => {
          this.running--;
          this.tick();
        });
    }
  }
}

export const scanQueue = new ScanQueue();

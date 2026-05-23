import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OrchestratorService } from '../services/orchestrator.service';
import { JOB_RUN_CREATION, QUEUE_STUDIO } from '../../queue/queue.constants';

@Processor(QUEUE_STUDIO, { concurrency: 1 })
export class StudioProcessor extends WorkerHost {
  private readonly logger = new Logger(StudioProcessor.name);

  constructor(private readonly orchestrator: OrchestratorService) {
    super();
  }

  async process(job: Job<{ creationId: string }>): Promise<void> {
    if (job.name !== JOB_RUN_CREATION) return;
    this.logger.log(`Running creation ${job.data.creationId}`);
    await this.orchestrator.runFull(job.data.creationId);
  }
}

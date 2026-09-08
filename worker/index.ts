import { handleRequest } from './router.mjs';
import { consumeDeliveryBatch, prepareDailyCampaign } from './push-delivery.mjs';
import type { PushDeliveryMessage, WorkerEnv } from './types';

interface QueueMessageLike<T> {
  body: T;
  ack(): void;
}

interface QueueBatchLike<T> {
  messages: Array<QueueMessageLike<T>>;
}

interface ScheduledControllerLike {
  scheduledTime: number;
}

export default {
  fetch(request: Request, env: WorkerEnv, context: ExecutionContext) {
    return handleRequest(request, env, context);
  },
  async scheduled(controller: ScheduledControllerLike, env: WorkerEnv) {
    const result = await prepareDailyCampaign(env, { scheduledTime: controller.scheduledTime });
    console.log(`[push] campaign ${result.status}; published ${result.published || 0}`);
  },
  async queue(batch: QueueBatchLike<PushDeliveryMessage>, env: WorkerEnv) {
    await consumeDeliveryBatch(env, batch);
  },
};

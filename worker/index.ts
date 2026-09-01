import { handleRequest } from './router.mjs';

export default {
  fetch(request: Request, env: Record<string, string>, context: ExecutionContext) {
    return handleRequest(request, env, context);
  },
};


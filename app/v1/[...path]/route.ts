import { handleMemory } from "../../../lib/http-memory/service";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { recordApplicationMetrics, recordTitleException } from "../../../lib/telemetry/metrics";
export const dynamic="force-dynamic";
type C={params:Promise<{path:string[]}>};
const run=(request:Request,context:C)=>trace.getTracer("watchnext-backend").startActiveSpan("watchnext.api.request", async span => {
  let path: string[] = [];
  try {
    ({ path } = await context.params);
    const response = await handleMemory(request, path);
    await recordApplicationMetrics(request.method, path, response);
    span.setAttribute("http.response.status_code", response.status);
    if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    return response;
  } catch (error) {
    recordTitleException(request.method, path);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally { span.end(); }
});
export const GET=run;export const POST=run;export const PUT=run;export const PATCH=run;export const DELETE=run;

import { handleMemory } from "../../../lib/http-memory/service";
import { trace, SpanStatusCode } from "@opentelemetry/api";
export const dynamic="force-dynamic";
type C={params:Promise<{path:string[]}>};
const run=(request:Request,context:C)=>trace.getTracer("watchnext-backend").startActiveSpan("watchnext.api.request", async span => {
  try {
    const { path } = await context.params;
    const response = await handleMemory(request, path);
    span.setAttribute("http.response.status_code", response.status);
    if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    return response;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally { span.end(); }
});
export const GET=run;export const POST=run;export const PUT=run;export const PATCH=run;export const DELETE=run;

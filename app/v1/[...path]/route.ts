import { handleMemory } from "../../../lib/http-memory/service";
export const dynamic="force-dynamic";
type C={params:Promise<{path:string[]}>};
const run=(request:Request,context:C)=>context.params.then(({path})=>handleMemory(request,path));
export const GET=run;export const POST=run;export const PUT=run;

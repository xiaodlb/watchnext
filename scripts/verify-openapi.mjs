import { readFileSync } from "node:fs";

const file = new URL("../openapi.yml", import.meta.url);
const spec = JSON.parse(readFileSync(file, "utf8"));
const requiredInventory = ["A01","A02","A03","A04","A05","G01","G02","G03","G04","G05","G06","G07","G08","L01","L02","L03","L04","W01","W02","W03","W04","W05","W06","W07","W08","M01","M02","M03","M04","M05","M06","P01","P02","P03","P04","P05","K01","K02","K03","K04"];
const methods = new Set(["get", "put", "post", "patch", "delete"]);
const operations = [];
for (const [path, item] of Object.entries(spec.paths ?? {})) {
  if (!path.startsWith("/v1/")) throw new Error(`Non-versioned path: ${path}`);
  for (const [method, operation] of Object.entries(item)) {
    if (!methods.has(method)) continue;
    if (!operation.operationId || !Array.isArray(operation["x-inventory"])) throw new Error(`${method.toUpperCase()} ${path} lacks operation metadata`);
    if (!operation.responses?.["200"]?.content?.["application/json"]?.example) throw new Error(`${operation.operationId} lacks a synthetic success example`);
    if (operation.requestBody && !operation.requestBody.content?.["application/json"]?.example) throw new Error(`${operation.operationId} lacks a synthetic request example`);
    operations.push(operation);
  }
}
if (spec.openapi !== "3.1.1") throw new Error("Contract must be OpenAPI 3.1.1");
if (new Set(operations.map((operation) => operation.operationId)).size !== operations.length) throw new Error("operationId values must be unique");
if (operations.length < 40) throw new Error(`Expected a complete API surface, found ${operations.length} HTTP operations`);
for (const id of requiredInventory) {
  const targets = spec["x-inventory-map"]?.[id];
  if (!Array.isArray(targets) || targets.length === 0) throw new Error(`Inventory ${id} has no mapping`);
  if (id === "M06") {
    if (targets[0] !== "internal:metadataLifecycleBeforeAndAfterGatedOperation") throw new Error("M06 must remain internal");
    continue;
  }
  if (!operations.some((operation) => operation["x-inventory"].includes(id))) throw new Error(`Inventory ${id} has no HTTP operation`);
}
function visit(value, location) {
  if (!value || typeof value !== "object") return;
  if (typeof value.$ref === "string") {
    if (!value.$ref.startsWith("#/components/schemas/")) throw new Error(`External or invalid ref at ${location}: ${value.$ref}`);
    const name = value.$ref.slice("#/components/schemas/".length);
    if (!spec.components?.schemas?.[name]) throw new Error(`Missing schema ref ${name} at ${location}`);
  }
  for (const [key, child] of Object.entries(value)) visit(child, `${location}/${key}`);
}
visit(spec, "#");
function dereference(schema) {
  return schema?.$ref ? spec.components.schemas[schema.$ref.slice("#/components/schemas/".length)] : schema;
}
function validateExample(value, rawSchema, location) {
  const schema = dereference(rawSchema);
  if (!schema) return;
  for (const branch of schema.allOf ?? []) validateExample(value, branch, location);
  if (schema.oneOf && !schema.oneOf.some((branch) => { try { validateExample(value, branch, location); return true; } catch { return false; } })) throw new Error(`Example does not match any union branch at ${location}`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`Example violates enum at ${location}`);
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (value === null && types.includes("null")) return;
  if (types.includes("object") && (value === null || typeof value !== "object" || Array.isArray(value))) throw new Error(`Expected object example at ${location}`);
  if (types.includes("array") && !Array.isArray(value)) throw new Error(`Expected array example at ${location}`);
  if (types.includes("string") && typeof value !== "string" && !types.includes("null")) throw new Error(`Expected string example at ${location}`);
  if (types.includes("integer") && (!Number.isInteger(value)) && !types.includes("null")) throw new Error(`Expected integer example at ${location}`);
  if (types.includes("boolean") && typeof value !== "boolean" && !types.includes("null")) throw new Error(`Expected boolean example at ${location}`);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) throw new Error(`Example lacks ${key} at ${location}`);
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (key in value) validateExample(value[key], child, `${location}.${key}`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, index) => validateExample(item, schema.items, `${location}[${index}]`));
}
for (const operation of operations) {
  const request = operation.requestBody?.content?.["application/json"];
  if (request) validateExample(request.example, request.schema, `${operation.operationId} request`);
  const response = operation.responses["200"].content["application/json"];
  validateExample(response.example, response.schema, `${operation.operationId} response`);
}
for (const name of ["Context", "ErrorEnvelope", "TitleDraft", "Title", "EntryReview", "PickerOutcome"]) {
  if (!spec.components.schemas[name]) throw new Error(`Required DTO schema missing: ${name}`);
}
for (const name of ["accountSession", "legacySession"]) if (!spec.components.securitySchemes[name]) throw new Error(`Missing cookie security scheme: ${name}`);
for (const key of ["origin", "cache", "bodyLimits", "handles", "cancellation", "modes"]) if (!spec["x-http-semantics"]?.[key]) throw new Error(`Missing documented HTTP semantic: ${key}`);
for (const key of ["U01", "U02", "U03", "U04", "U05", "U06"]) if (!spec["x-client-only"]?.[key]) throw new Error(`Missing client-only exclusion: ${key}`);
console.log(`PASS: OpenAPI 3.1.1; ${operations.length} HTTP operations; ${requiredInventory.length} inventory IDs; references and synthetic examples validated.`);

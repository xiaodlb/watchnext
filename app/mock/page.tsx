import { selectDemo } from "../../frontend/service/contracts";
import { MockEntry } from "./preview";
export default async function MockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <MockEntry selection={selectDemo(query.mode, query.scenario)} filter={query.filter} />;
}

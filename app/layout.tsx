import type { ReactNode } from "react";

// The public interface lives in lovable-frontend; Next serves the API.
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

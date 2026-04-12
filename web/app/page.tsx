"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("@/src/spa/App"), { ssr: false });

export default function RootPage() {
  return <App />;
}

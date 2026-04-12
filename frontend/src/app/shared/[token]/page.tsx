"use client";

import { use } from "react";
import dynamic from "next/dynamic";

const SharedPlaygroundView = dynamic(
  () => import("@/components/playground/SharedPlaygroundView"),
  { ssr: false }
);

export default function SharedPlaygroundPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <SharedPlaygroundView token={token} />;
}

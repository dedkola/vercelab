import type { Metadata } from "next";

import { ContainerObservabilityPage } from "@/components/container-observability-page";

export const metadata: Metadata = {
  title: "Containers | Vercelab",
  description: "Static preview of a container operations workspace.",
};

export default function ContainersPage() {
  return <ContainerObservabilityPage />;
}

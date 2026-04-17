import { ContainerObservabilityPage } from "@/components/container-observability-page";
import { loadContainerObservabilityPageData } from "@/lib/container-observability-page-data";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams?: Promise<{
    page?: string | string[];
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const pageData = await loadContainerObservabilityPageData(searchParams);

  return <ContainerObservabilityPage {...pageData} />;
}

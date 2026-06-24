import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{
    range?: string | string[];
  }>;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const range = getSearchParamValue(params?.range);

  redirect(range ? `/?range=${encodeURIComponent(range)}` : "/");
}

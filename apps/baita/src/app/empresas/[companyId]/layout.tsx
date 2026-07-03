import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AuthError, ForbiddenError, requireCompanyAccess } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  const user = await requireCompanyAccess(companyId).catch((error) => {
    if (error instanceof AuthError) redirect("/login");
    if (error instanceof ForbiddenError) notFound();
    throw error;
  });

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar user={user} companyName={company.name} />
      <div className="flex flex-1">
        <Sidebar companyId={companyId} />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

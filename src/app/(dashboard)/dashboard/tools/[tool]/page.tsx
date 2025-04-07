import PageContainer from "@/components/dashboard/page-container";
import PageHeader from "@/components/dashboard/page-headerheader";
import { tools, ToolType } from "@/config/tools";
import { notFound } from "next/navigation";

const ToolPage = async ({ params }: { params: Promise<{ tool: string }> }) => {
  const toolType = (await params).tool as ToolType;
  const tool = tools[toolType];
  if (!tool) {
    notFound();
  }
  const ToolComponent = tool.component;
  return (
    <PageContainer>
      <PageHeader title={tool.title} description={tool.description} />
      <div className="max-w-2xl">
        <ToolComponent />
      </div>
    </PageContainer>
  );
};

export default ToolPage;

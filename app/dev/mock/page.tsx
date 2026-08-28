import { notFound } from "next/navigation";
import DevMockPlayer from "@/components/DevMockPlayer";

export default function DevMockPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevMockPlayer />;
}

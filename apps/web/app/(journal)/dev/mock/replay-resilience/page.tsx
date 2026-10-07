import { notFound } from "next/navigation";
import ReplayResilienceMock from "@/components/ReplayResilienceMock";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ReplayResilienceMock />;
}

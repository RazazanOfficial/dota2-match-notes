import { notFound } from "next/navigation";
import DevMockPlayer from "@/components/DevMockPlayer";

export const metadata = {
  title: "Dota2Notes UI Preview",
};

export default function DevMockPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevMockPlayer />;
}

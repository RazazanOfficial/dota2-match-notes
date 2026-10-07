import { forwardApiRequest } from "@/lib/backend/proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = forwardApiRequest;
export const PUT = forwardApiRequest;

import { forwardApiRequest } from "@/lib/backend/proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = forwardApiRequest;
export const POST = forwardApiRequest;
export const PUT = forwardApiRequest;
export const DELETE = forwardApiRequest;
export const HEAD = forwardApiRequest;
export const OPTIONS = forwardApiRequest;

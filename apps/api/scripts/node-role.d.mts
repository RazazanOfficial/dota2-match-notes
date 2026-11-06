export type NodeRole = "standalone" | "app" | "compute";
export function getNodeRole(env?: NodeJS.ProcessEnv): NodeRole;
export function requireComputeNode(env?: NodeJS.ProcessEnv): void;

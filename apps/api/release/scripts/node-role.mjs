export function getNodeRole(env = process.env) {
  const role = env.DOTA_NODE_ROLE?.trim() || "standalone";
  if (!["standalone", "app", "compute"].includes(role)) throw new Error("Invalid DOTA_NODE_ROLE");
  return role;
}
export function requireComputeNode(env = process.env) {
  if (getNodeRole(env) === "app") throw new Error("Background processing is disabled on the application node");
}

// npm versions can mark the same direct runtime dependency as a peer when a
// development dependency also consumes it. This installation flag is not part
// of its version, integrity or dependency contract; peerDependencies still is.
export function sameRuntimePackage(source, production) {
  if (!source || !production) return false;
  const { peer: sourcePeer, ...sourcePackage } = source;
  const { peer: productionPeer, ...productionPackage } = production;
  return JSON.stringify(sourcePackage) === JSON.stringify(productionPackage);
}

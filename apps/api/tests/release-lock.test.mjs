import {describe,expect,it} from 'vitest';
import {sameRuntimePackage} from '../scripts/release-lock.mjs';
const runtime={version:'1.2.3',resolved:'https://registry.npmjs.org/example/-/example-1.2.3.tgz',integrity:'sha512-test-fixture',dependencies:{dependency:'^1.0.0'},peerDependencies:{native:'>=3'},peerDependenciesMeta:{native:{optional:true}}};
describe('source and production dependency parity',()=>{
 it('accepts only the npm peer installation flag differing between dev and runtime trees',()=>{
  expect(sameRuntimePackage({...runtime,peer:true},runtime)).toBe(true);
  expect(sameRuntimePackage(runtime,{...runtime,peer:true})).toBe(true);
 });
 it.each([{version:'1.2.4'},{integrity:'sha512-different'},{dependencies:{dependency:'^2.0.0'}},{peerDependencies:{native:'>=4'}}])('rejects a changed runtime identity or dependency contract: %j',change=>{
  expect(sameRuntimePackage({...runtime,...change},runtime)).toBe(false);
 });
 it('rejects a missing production dependency in the source lock',()=>{expect(sameRuntimePackage(undefined,runtime)).toBe(false);});
});

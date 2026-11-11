import {describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {desktopAssets} from '../scripts/asset-plugin';
import manifest from '../asset-manifest.json';
describe('desktop asset distribution',()=>{
 it('keeps an unchanged manifest untouched so Vite does not restart recursively',async()=>{
  const {generateAssetManifest}=await import('../scripts/asset-pack.mjs');
  const path=fileURLToPath(new URL('../asset-manifest.json',import.meta.url));
  await generateAssetManifest(false);const before=await stat(path,{bigint:true});
  await generateAssetManifest(false);expect((await stat(path,{bigint:true})).mtimeNs).toBe(before.mtimeNs);
 });
 it('rewrites shared static and dynamic media references without changing API URLs',()=>{
  const plugin=desktopAssets(),render=plugin.renderChunk as (code:string)=>{code:string}|null;
  const output=render('const a="/heroes/axe.png";const b=`/positions/${name}.png`;const c="/hero_universal.png";const api="/api/matches/me";');
  expect(output?.code).toMatch(/(?:dota-assets:\/\/localhost|http:\/\/dota-assets.localhost)\/heroes\/axe.png/);
  expect(output?.code).toMatch(/(?:dota-assets:\/\/localhost|http:\/\/dota-assets.localhost)\/positions\//);
  expect(output?.code).toContain('/api/matches/me');expect(output?.code).not.toContain('api.dota2notes.ir');expect(()=>new Function('name',output!.code)).not.toThrow();
 });
 it('has a deterministic manifest matching actual source bytes, without bundled fonts or obsolete folder lessons',async()=>{
  const paths=new Set<string>();for(const file of manifest.files){expect(paths.has(file.path)).toBe(false);paths.add(file.path);const bytes=await readFile(fileURLToPath(new URL(`../public/${file.path}`,import.meta.url)));expect(bytes.length).toBe(file.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);expect(file.path).not.toMatch(/^fonts\//);if(file.path.startsWith('tutorials/replay-folder/'))expect(file.path.endsWith('/step-01.png')).toBe(true);}
  expect(createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex')).toBe(manifest.version);
 });
});

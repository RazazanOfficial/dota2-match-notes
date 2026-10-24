import {describe,it,expect} from "vitest";
import {palettes,themeNames,readPreferences} from "../src";
const luminance=(hex:string)=>{const values=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*values[0]+.7152*values[1]+.0722*values[2];};
const contrast=(a:string,b:string)=>{const [high,low]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(high+.05)/(low+.05);};
describe("readable application themes",()=>{
 for(const name of themeNames)for(const appearance of ["light","dark"] as const)it(`${name} / ${appearance} keeps text and action labels readable`,()=>{
  const p=palettes[name][appearance];expect(readPreferences(JSON.stringify({theme:name,appearance})).theme).toBe(name);
  for(const background of [p.bg,p.panel,p.panel2]){expect(contrast(p.text,background)).toBeGreaterThanOrEqual(4.5);expect(contrast(p.muted,background)).toBeGreaterThanOrEqual(4.5);}
  expect(contrast(p.accentText,p.accent)).toBeGreaterThanOrEqual(4.5);
 });
});

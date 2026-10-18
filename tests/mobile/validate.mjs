import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseAllDocuments} from 'yaml';
import {checkInterpolations} from './interpolation.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const commands=new Set(['launchApp','extendedWaitUntil','assertVisible','assertNotVisible','tapOn','longPressOn','scrollUntilVisible','runFlow','openLink','eraseText','inputText','hideKeyboard','takeScreenshot','swipe','copyTextFrom','evalScript','pressKey']);
const files=['flows','helpers','expected-failure'].flatMap(directory=>fs.readdirSync(path.join(root,directory)).filter(file=>file.endsWith('.yaml')).map(file=>path.join(root,directory,file)));
const dependencies=new Map();
const launchPlatforms=new Set();
const restartPlatforms=new Set();
const routes=new Set(['playground://home','playground://shop','playground://shop/cart','playground://shop?bug=cart-total','playground://flights','playground://flights/bookings','playground://tasks','playground://tasks/task/CKB-001','playground://tasks/task/CKB-2401','playground://observability/logs','playground://observability/monitors']);
function checkSteps(steps,file,platform){
 assert.ok(Array.isArray(steps)&&steps.length>0,`${file}: commands must be a nonempty list`);
 for(const step of steps){
  const name=typeof step==='string'?step:Object.keys(step||{})[0];
  assert.ok(commands.has(name),`${file}: unsupported command ${name}`);
  if(typeof step==='object')assert.equal(Object.keys(step).length,1,`${file}: each command must have exactly one key`);
  const value=typeof step==='object'?step[name]:undefined;
  if(name==='runFlow'){
   if(value?.env?.LINK)assert.ok(routes.has(value.env.LINK),`${file}: route needs an explicit navigation mapping: ${value.env.LINK}`);
   const target=typeof value==='string'?value:value.file;
   if(target){const resolved=path.resolve(path.dirname(file),target);assert.ok(resolved.startsWith(root+path.sep),`${file}: helper outside test suite`);assert.ok(fs.existsSync(resolved),`${file}: missing helper ${target}`);dependencies.get(file).push(resolved);if(path.basename(resolved)==='navigate-ios.yaml')assert.equal(value.when?.platform,'iOS',`${file}: visible-control routing is iOS-only`)}
   else {assert.ok(value.when,`${file}: inline flow requires a condition`);checkSteps(value.commands,file,value.when.platform||platform)}
  }
  if(name==='swipe'){
   assert.ok(value.from&&(value.from.id||value.from.text),`${file}: swipe must start at a stable element selector`);
   assert.ok(['DOWN','UP','LEFT','RIGHT'].includes(value.direction),`${file}: swipe needs a direction`);
   assert.ok(!value.start&&!value.end,`${file}: use an element-anchored swipe instead of coordinates`);
   if(value.duration!==undefined)assert.ok(value.duration>0&&value.duration<=5000,`${file}: swipe duration must be bounded`);
  }
  if(name==='copyTextFrom')assert.ok(typeof value==='string'||value?.id||value?.text,`${file}: copyTextFrom needs a rendered element`);
  if(name==='evalScript')assert.equal(typeof value,'string',`${file}: evalScript must be a test expression`);
  if(name==='pressKey'){assert.equal(value,'back',`${file}: only actual Back navigation is exercised`);assert.equal(platform,'Android',`${file}: hardware Back is Android-only`)}
  if(name==='scrollUntilVisible')assert.ok(value.element&&['DOWN','UP','LEFT','RIGHT'].includes(value.direction),`${file}: scroll needs a selector and direction`);
  if(name==='launchApp'){
   const restarting=file===path.join(root,'helpers','controls-restart.yaml');
   assert.ok(restarting||file===path.join(root,'helpers','launch.yaml'),`${file}: launches belong in the shared isolation or explicit restart helper`);
   assert.equal(value.permissions?.all,'deny',`${file}: native smoke must run without granting permissions`);
   assert.ok(['Android','iOS'].includes(platform),`${file}: session reset must be explicitly scoped by platform`);
   const platforms=restarting?restartPlatforms:launchPlatforms;
   assert.ok(!platforms.has(platform),`${file}: duplicate ${platform} session ${restarting?'restart':'reset'}`);
   platforms.add(platform);
   if(restarting){
    assert.equal(value.stopApp,true,`${file}: restart must stop the existing process`);
    assert.ok(!Object.hasOwn(value,'clearState'),`${file}: restart must prove recovery without clearing application storage`);
   }else if(platform==='Android')assert.equal(value.clearState,true,`${file}: Android starts with cleared app state`);
   else{
    assert.equal(value.stopApp,true,`${file}: iOS must restart the process-local session`);
    assert.ok(!Object.hasOwn(value,'clearState'),`${file}: iOS must preserve installed URL-scheme registration`);
   }
  }
  if(name==='openLink'){
   assert.match(value,/^(playground:\/\/|\$\{LINK\})/,`${file}: test must not navigate to an external service`);
   assert.equal(platform,'Android',`${file}: iOS URL coverage belongs to mandatory NativeLinkTests, not simctl-backed Maestro openLink`);
  }
  if(name==='tapOn'||name==='longPressOn'||name.startsWith('assert')){
   assert.ok(typeof value==='string'||(value&&(value.id||value.text)),`${file}: selector needs stable text or id`);
   assert.ok(!value?.point,`${file}: coordinate-only selectors are not allowed`);
  }
 }
}
for(const file of files){
 const docs=parseAllDocuments(fs.readFileSync(file,'utf8'));
 for(const doc of docs)assert.equal(doc.errors.length,0,`${file}: ${doc.errors.map(error=>error.message).join(', ')}`);
 assert.equal(docs.length,2,`${file}: requires config and command documents`);
 const [config,steps]=docs.map(doc=>doc.toJSON());
 checkInterpolations([config,steps],file);
 assert.equal(config.appId,'dev.vostride.playground',`${file}: wrong native app id`);
 dependencies.set(file,[]);
 checkSteps(steps,file);
 if(file.includes(`${path.sep}flows${path.sep}`)){
  assert.ok(config.name,`${file}: descriptive name required`);
  assert.equal(steps[0].runFlow,'../helpers/launch.yaml',`${file}: each scenario starts with a clean session`);
  assert.ok(steps.some(step=>step.assertVisible),`${file}: scenario must assert a product outcome`);
  assert.ok(steps.some(step=>step.takeScreenshot),`${file}: scenario must preserve visual evidence`);
 }
}
assert.deepEqual([...launchPlatforms].sort(),['Android','iOS'],'Shared launch helper must reset both platforms');
assert.deepEqual([...restartPlatforms].sort(),['Android','iOS'],'Explicit restart helper must restart both platforms without clearing storage');
function visit(file,ancestors=[]){assert.ok(!ancestors.includes(file),`Recursive helper cycle: ${[...ancestors,file].join(' → ')}`);for(const next of dependencies.get(file)||[])visit(next,[...ancestors,file])}
for(const file of files)visit(file);
assert.equal(files.filter(file=>file.includes(`${path.sep}flows${path.sep}`)).length,5,'Expected all five native acceptance scenarios');
console.log(`Validated ${files.length} Maestro YAML files, helper references, selectors, and clean-session coverage. Native runtime execution remains a separate CI gate.`);
